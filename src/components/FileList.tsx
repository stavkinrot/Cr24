import React from 'react';
import { GeneratedExtension } from '../types';
import '../styles/FileList.css';

interface FileListProps {
  extension: GeneratedExtension;
  chatTitle?: string;
}

const FileList: React.FC<FileListProps> = ({ extension }) => {
  const downloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
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
