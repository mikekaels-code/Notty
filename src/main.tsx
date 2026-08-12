import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import App from "./web/components/App";
import { rehydrateStore, store } from "./core/store";
import "@flaticon/flaticon-uicons/css/bold/straight.css";
import "./web/styles/global.scss";
import { initStorage } from "./web/storage/storageFactory";
import "./web/styles/global.scss";

rehydrateStore(store);
void initStorage(store);

// Prevent pinch-zoom on iOS Safari (ignores `user-scalable=no`).
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("gesturechange", (e) => e.preventDefault());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
