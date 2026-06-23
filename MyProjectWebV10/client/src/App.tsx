import { AuthProvider } from './context/AuthContext';
import { AppRouter } from './components/AppRouter';
import './styles/panelButtons.css';
import './App.css';

export default function App() {
  return (
    <AuthProvider>
      <div className="app">
        <AppRouter />
      </div>
    </AuthProvider>
  );
}
