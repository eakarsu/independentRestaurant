import jsPDF from "jspdf";
import "jspdf-autotable";

declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: Record<string, unknown>) => jsPDF;
  }
}

interface ExportColumn {
  header: string;
  field: string;
  format?: (value: unknown) => string;
}

interface PDFExportOptions {
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  data: Record<string, unknown>[];
  filename?: string;
  orientation?: "portrait" | "landscape";
}

export function exportToPDF(options: PDFExportOptions) {
  const {
    title,
    subtitle,
    columns,
    data,
    filename = "export.pdf",
    orientation = "portrait",
  } = options;

  const doc = new jsPDF({ orientation });

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, 22);

  if (subtitle) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(subtitle, 14, 30);
  }

  doc.setFontSize(9);
  doc.setTextColor(150);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, subtitle ? 38 : 30);

  const headers = columns.map((col) => col.header);
  const rows = data.map((item) =>
    columns.map((col) => {
      const value = col.field.split(".").reduce((obj: unknown, key: string) => (obj as Record<string, unknown>)?.[key], item);
      return col.format ? col.format(value) : (value ?? "").toString();
    })
  );

  doc.autoTable({
    head: [headers],
    body: rows,
    startY: subtitle ? 44 : 36,
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [41, 37, 36], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 244] },
    margin: { top: 14, right: 14, bottom: 14, left: 14 },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
    doc.text("RestaurantAI Management System", 14, doc.internal.pageSize.getHeight() - 10);
  }

  doc.save(filename);
}
