import { Component } from "react";
import { resetAndReload } from "./storage";

/* Last line of defence: any render error shows this instead of a blank page. Inline styles, so it
   still looks right if the stylesheet or the theme is the thing that broke. */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Intervo crashed:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const box = { minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#0f1115", color: "#e8eaf0", fontFamily: "system-ui, sans-serif" };
    const btn = { padding: "10px 18px", borderRadius: 8, border: 0, cursor: "pointer", font: "inherit", fontWeight: 600 };
    return (
      <div style={box} role="alert">
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ margin: "0 0 20px", opacity: 0.8, lineHeight: 1.5 }}>
            Intervo hit an unexpected problem, often caused by old saved data. Resetting clears Intervo's saved data in this browser and reloads the app.
          </p>
          <button style={{ ...btn, background: "#6c63ff", color: "#fff" }} onClick={resetAndReload}>Reset and reload</button>{" "}
          <button style={{ ...btn, background: "#2a2e38", color: "#e8eaf0" }} onClick={() => window.location.reload()}>Just reload</button>
        </div>
      </div>
    );
  }
}
