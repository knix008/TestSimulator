// Block-diagram editor for the app shell.
//   <ModelEditor engine={engine} path={path} lang={lang} active onDirty onTitle onSaveAs? onPath? onNew? onOpen? />
export { ModelEditor } from './ModelEditor.jsx';
// The app's side panels of the simulation screen (블록 라이브러리 · 모델 구조 · 블록 속성), driven by editorApi.js.
export { SimLibraryPane, SimTreePane, BlockPropsPane } from './SidePanes.jsx';
export { newModelName, MODEL_EXT } from '../../core/sim/model.js';
