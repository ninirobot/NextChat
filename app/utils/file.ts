import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import JSZip from "jszip";

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

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

    // PPTX files store slides in ppt/slides/slideN.xml
    const slideFiles = Object.keys(zip.files).filter((path) =>
        path.startsWith("ppt/slides/slide") && path.endsWith(".xml")
    );

    // Sort slides by number
    slideFiles.sort((a, b) => {
        const matchA = a.match(/\d+/);
        const matchB = b.match(/\d+/);
        const numA = parseInt(matchA ? matchA[0] : "0");
        const numB = parseInt(matchB ? matchB[0] : "0");
        return numA - numB;
    });

    for (const slideFile of slideFiles) {
        const content = await zip.file(slideFile)?.async("text");
        if (content) {
            // Basic XML text extraction (regex-based for simplicity in browser)
            const textMatches = content.match(/<a:t>([^<]+)<\/a:t>/g);
            if (textMatches) {
                const slideText = textMatches
                    .map((tag) => tag.replace(/<\/?a:t>/g, ""))
                    .join(" ");
                fullText += `Slide:\n${slideText}\n\n`;
            }
        }
    }

    return fullText;
}

export async function parseFile(file: File): Promise<string> {
    const extension = file.name.split(".").pop()?.toLowerCase();

    switch (extension) {
        case "txt":
        case "md":
        case "js":
        case "ts":
        case "tsx":
        case "c":
        case "cpp":
        case "py":
            return await readTextFile(file);
        case "pdf":
            return await readPdfFile(file);
        case "docx":
            return await readDocxFile(file);
        case "xlsx":
        case "xls":
            return await readXlsxFile(file);
        case "pptx":
            return await readPptxFile(file);
        default:
            // Try reading as text by default for unknown types
            try {
                return await readTextFile(file);
            } catch {
                throw new Error(`Unsupported file type: ${extension}`);
            }
    }
}
