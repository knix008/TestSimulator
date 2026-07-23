import { useRef, useState, useCallback } from 'react';
import { t } from '../i18n';

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'bmp', 'webp', 'svg'];
const MODEL_EXTS = ['obj', 'gltf', 'glb'];
const ACCEPTED   = ['.dxf', '.ifc', '.obj', '.gltf', '.glb', '.jpg', '.jpeg', '.png', '.bmp', '.webp', '.svg'];

function getFileType(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (MODEL_EXTS.includes(ext)) return 'model';
  if (ext === 'ifc') return 'ifc';
  return 'dxf';
}

export default function FileDropZone({ onFile, lang }) {
  const inputRef  = useRef(null);
  const [dragging, setDragging] = useState(false);
  const _ = (key) => t(lang, key);

  const handleFile = useCallback((file) => {
    if (!file) return;
    const ext  = file.name.split('.').pop().toLowerCase();
    const type = getFileType(file.name);
    const reader = new FileReader();

    if (type === 'image') {
      reader.onload = (e) => onFile({ type: 'image', name: file.name, dataUrl: e.target.result });
      reader.readAsDataURL(file);
    } else if (type === 'model') {
      if (ext === 'glb') {
        reader.onload = (e) => {
          const b64 = e.target.result.split(',')[1]; // data URL → base64
          onFile({ type: 'model', name: file.name, content: b64, modelType: 'glb' });
        };
        reader.readAsDataURL(file);
      } else {
        reader.onload = (e) => onFile({ type: 'model', name: file.name, content: e.target.result, modelType: ext });
        reader.readAsText(file, 'utf-8');
      }
    } else if (type === 'ifc') {
      reader.onload = (e) => onFile({ type: 'ifc', name: file.name, content: e.target.result });
      reader.readAsText(file, 'utf-8');
    } else {
      reader.onload = (e) => onFile({ type: 'dxf', name: file.name, content: e.target.result });
      reader.readAsText(file, 'utf-8');
    }
  }, [onFile]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const openDialog = useCallback(async () => {
    if (window.electronAPI?.isElectron) {
      const result = await window.electronAPI.openFile();
      if (result) onFile(result);
    } else {
      inputRef.current?.click();
    }
  }, [onFile]);

  return (
    <div
      className={`drop-zone ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={openDialog}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files[0])}
      />
      <div className="drop-icon">
        <svg viewBox="0 0 64 64" fill="none">
          <rect x="8" y="8" width="48" height="48" rx="6" stroke="currentColor" strokeWidth="2"/>
          <path d="M32 20v24M20 32h24" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
        </svg>
      </div>
      <h2>{_('dropTitle')}</h2>
      <p>{_('dropSub')}</p>
      <div className="drop-formats">
        <span className="badge dxf">DXF</span>
        <span className="badge dxf">IFC</span>
        <span className="badge img">JPG</span>
        <span className="badge img">PNG</span>
        <span className="badge img">SVG</span>
        <span className="badge img">WebP</span>
        <span className="badge model">OBJ</span>
        <span className="badge model">glTF</span>
      </div>
      <p className="drop-hint">{_('dropHint')}</p>
    </div>
  );
}
