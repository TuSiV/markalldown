import React from "react";
import ReactDOM from "react-dom/client";
const App = React.lazy(() => import.meta.env.MODE === "web" ? import("./web/WebApp") : import("./App"));
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <React.Suspense fallback={<p>正在加载 MarkAllDown…</p>}><App /></React.Suspense>
  </React.StrictMode>,
);
