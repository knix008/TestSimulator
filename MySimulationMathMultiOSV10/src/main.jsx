import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { PopupWindow } from './views/PopupWindow';
import { popupRoute } from './lib/popups';
import { MenuHost } from './components/MenuHost';
import { installContextMenus } from './lib/contextMenus';
import './styles.css';
import './app.css';

class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return <div className="boot selectable">{this.state.error.message}</div>;
    }
    return this.props.children;
  }
}

// Our icon context menu everywhere instead of the built-in one (child windows draw it in-page).
installContextMenus();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Boundary>{popupRoute() ? <><PopupWindow /><MenuHost /></> : <App />}</Boundary>
  </React.StrictMode>,
);
