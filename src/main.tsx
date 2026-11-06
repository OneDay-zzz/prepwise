import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './tokens.css';
import './styles.css';
import './organization.css';
import './settings.css';
import './dark.css';
import './layout.css';
import './refresh.css';

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {error: boolean}> {
  state = {error:false};
  static getDerivedStateFromError() {return {error:true};}
  render() {return this.state.error ? <div className="loading-screen"><h2>Something didn’t load.</h2><p>Reload the page to reopen your saved workspace.</p><button className="primary" onClick={() => location.reload()}>Reload workspace</button></div> : this.props.children;}
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App/></ErrorBoundary></React.StrictMode>);
