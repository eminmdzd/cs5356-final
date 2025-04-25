"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2 } from "lucide-react";

interface PdfViewerProps {
  pdfUrl: string;
  fileName: string;
}

export function PdfViewer({ pdfUrl, fileName }: PdfViewerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  // Create the full URL for the PDF
  const fullPdfUrl = pdfUrl.startsWith("http") ? pdfUrl : `/${pdfUrl.replace(/^\//, "")}`;

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <div className="p-3 border-b flex justify-between items-center">
        <h3 className="font-medium truncate">{fileName}</h3>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            asChild
          >
            <a href={fullPdfUrl} target="_blank" rel="noopener noreferrer">
              Open in New Tab
            </a>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={toggleExpand}
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className={`relative ${isExpanded ? 'h-[800px]' : 'h-[400px]'} transition-all duration-300`}>
        <iframe
          src={`${fullPdfUrl}#toolbar=0`}
          className="w-full h-full"
          title={fileName}
        />
      </div>
    </div>
  );
}