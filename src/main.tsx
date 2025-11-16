import ReactDOM from "react-dom/client";
import './index.css'
import App from './App.tsx'
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import MainScreen from './components/MainScreen.tsx';
import PdfViewer from './components/PdfViewer.tsx';
import React from "react";
import Settings from "./components/Settings.tsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <MainScreen /> },
      { path: "viewer/:id", element: <PdfViewer /> },
      { path: "settings", element: <Settings/> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);