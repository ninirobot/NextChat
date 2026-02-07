import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import JSZip from "jszip";

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export async function readTextFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

export async function readPdfFile(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
            .map((item: any) => item.str)
            .join(" ");
        fullText += pageText + "\n";
    }

    return fullText;
}

export async function readDocxFile(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
}

export async function readXlsxFile(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    let fullText = "";

    workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        fullText += `Sheet: ${sheetName}\n`;
        fullText += XLSX.utils.sheet_to_txt(worksheet) + "\n";
    });

    return fullText;
}

export async function readPptxFile(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    let fullText = "";

    // Helper function to extract all text from XML content
    const extractTextFromXml = (xmlContent: string): string => {
        const texts: string[] = [];

        // Extract text from <a:t> tags (main text)
        const textMatches = xmlContent.match(/<a:t>([^<]*)<\/a:t>/g);
        if (textMatches) {
            textMatches.forEach((tag) => {
                const text = tag.replace(/<\/?a:t>/g, "").trim();
                if (text) texts.push(text);
            });
        }

        // Extract text from <a:fld> fields (dates, slide numbers, etc.)
        const fieldMatches = xmlContent.match(/<a:fld[^>]*>[\s\S]*?<\/a:fld>/g);
        if (fieldMatches) {
            fieldMatches.forEach((field) => {
                const innerText = field.match(/<a:t>([^<]*)<\/a:t>/g);
                if (innerText) {
                    innerText.forEach((tag) => {
                        const text = tag.replace(/<\/?a:t>/g, "").trim();
                        if (text) texts.push(text);
                    });
                }
            });
        }

        return texts.join(" ");
    };

    // Get all slide files
    const slideFiles = Object.keys(zip.files).filter((path) =>
        path.startsWith("ppt/slides/slide") && path.endsWith(".xml") && !path.includes("_rels")
    );

    // Sort slides by number
    slideFiles.sort((a, b) => {
        const matchA = a.match(/slide(\d+)\.xml/);
        const matchB = b.match(/slide(\d+)\.xml/);
        const numA = parseInt(matchA ? matchA[1] : "0");
        const numB = parseInt(matchB ? matchB[1] : "0");
        return numA - numB;
    });

    for (let i = 0; i < slideFiles.length; i++) {
        const slideFile = slideFiles[i];
        const slideNum = i + 1;
        let slideContent = `Slide ${slideNum}:\n`;

        // Extract slide content
        const content = await zip.file(slideFile)?.async("text");
        if (content) {
            const slideText = extractTextFromXml(content);
            if (slideText) {
                slideContent += slideText + "\n";
            }
        }

        // Try to extract notes for this slide
        const notesFile = `ppt/notesSlides/notesSlide${slideNum}.xml`;
        if (zip.files[notesFile]) {
            const notesContent = await zip.file(notesFile)?.async("text");
            if (notesContent) {
                const notesText = extractTextFromXml(notesContent);
                if (notesText) {
                    slideContent += `[Notes: ${notesText}]\n`;
                }
            }
        }

        fullText += slideContent + "\n";
    }

    // Extract text from diagrams/SmartArt if present
    const diagramFiles = Object.keys(zip.files).filter((path) =>
        path.startsWith("ppt/diagrams/") && path.endsWith(".xml")
    );

    if (diagramFiles.length > 0) {
        let diagramText = "";
        for (const diagramFile of diagramFiles) {
            const content = await zip.file(diagramFile)?.async("text");
            if (content) {
                const text = extractTextFromXml(content);
                if (text) {
                    diagramText += text + " ";
                }
            }
        }
        if (diagramText.trim()) {
            fullText += `\nDiagrams/SmartArt:\n${diagramText.trim()}\n`;
        }
    }

    return fullText.trim();
}


export async function parseFile(file: File): Promise<string> {
    const extension = file.name.split(".").pop()?.toLowerCase();

    switch (extension) {
        case "txt":
        case "md":
            return await readTextFile(file);
        case "pdf":
            return await readPdfFile(file);
        case "docx":
            return await readDocxFile(file);
        case "doc":
            throw new Error(
                "不支持旧版 .doc 格式。请使用 Microsoft Word 或 WPS 将文件另存为 .docx 格式后重试。"
            );
        case "xlsx":
        case "xls":
            return await readXlsxFile(file);
        case "pptx":
            return await readPptxFile(file);
        case "ppt":
            throw new Error(
                "不支持旧版 .ppt 格式。请使用 Microsoft PowerPoint 或 WPS 将文件另存为 .pptx 格式后重试。"
            );
        default:
            // Try reading as text by default for common text-based office files
            try {
                return await readTextFile(file);
            } catch {
                throw new Error(`不支持的文件类型: ${extension}`);
            }
    }
}

