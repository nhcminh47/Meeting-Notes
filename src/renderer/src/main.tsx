import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installBrowserMock } from "./browserMock";
import "./styles/styles.scss";

installBrowserMock();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
