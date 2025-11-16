import { useRef } from "react";
import { PDFLinkService } from "pdfjs-dist/web/pdf_viewer.mjs";
import { useOutletContext } from "react-router-dom";
import type { AppOutletCtx } from "../App";

type JumpBarProps = {
  LinkService: PDFLinkService | null;
  pagesCount: number;
};

export default function JumpBar({ LinkService, pagesCount }: JumpBarProps) {
    const JumpBarRef = useRef<HTMLDivElement>(null);
    const InputField = useRef<HTMLInputElement>(null);
    const {langMap} = useOutletContext<AppOutletCtx>();
    function handleJump() {
        if (InputField.current) {
            const value = parseInt(InputField.current.value);
            if (value > 0 && value <= pagesCount) {
              if (LinkService) {
                LinkService.goToPage(value);
                console.log("FTL jump complete...");
              } 
              else {
                return;
                // alert("PDF LinkService 未就绪");
              }
            } else {           
              if (window.electronAPI) {
                window.electronAPI.showAlert({
                  type: 'error',
                  title: langMap["invalidInput"]||"无效输入",
                  message: langMap["exceedMaxPage"] || `Exceed Maximum Page Limit (${pagesCount})`
                });
              }

              
            }
            
        }
    }
  return (
    <div className="jump-bar" ref={JumpBarRef}>
      <input type="number" ref={InputField} style={{height:30,border:"1px solid #ccc", borderRadius:4}}/>
      <button onClick={handleJump}>{langMap["jump"]||"跳转"}</button>
    </div>
  );
}