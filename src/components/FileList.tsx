import React from 'react';
import JSZip from 'jszip';
import { GeneratedExtension } from '../types';
import '../styles/FileList.css';

interface FileListProps {
  extension: GeneratedExtension;
  chatTitle?: string;
}

const FileList: React.FC<FileListProps> = ({ extension, chatTitle }) => {
  const downloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadZip = async () => {
    const zip = new JSZip();

    // Add manifest.json
    zip.file('manifest.json', JSON.stringify(extension.manifest, null, 2));

    // Add all other files
    Object.entries(extension.files).forEach(([filename, content]) => {
      zip.file(filename, content);
    });

    // Generate a filename from chat title or use default
    const sanitizeFilename = (name: string) => {
      // Remove invalid filename characters and limit length
      return name
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 50)
        .toLowerCase();
    };

    const zipFilename = chatTitle
      ? `${sanitizeFilename(chatTitle)}.zip`
      : 'chrome-extension.zip';

    // Generate and download zip
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = zipFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatFileSize = (content: string) => {
    const bytes = new Blob([content]).size;
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const allFiles = {
    'manifest.json': JSON.stringify(extension.manifest, null, 2),
    ...extension.files,
  };

  return (
    <div className="file-list">
      <button className="download-zip-button" onClick={downloadZip}>
        Download ZIP
      </button>
      <div className="files">
        {Object.entries(allFiles).map(([filename, content]) => (
          <button
            key={filename}
            className="file-item"
            onClick={() => downloadFile(filename, content)}
            title={`Click to download ${filename}`}
          >
            <span className="file-name">{filename}</span>
            <span className="file-size">({formatFileSize(content)})</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default FileList;
