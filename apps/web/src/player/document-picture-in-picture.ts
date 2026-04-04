export interface DocumentPictureInPictureApi {
  requestWindow: (options?: {
    width?: number;
    height?: number;
    disallowReturnToOpener?: boolean;
    preferInitialWindowPlacement?: boolean;
  }) => Promise<Window>;
  window?: Window | null;
}

interface DocumentPictureInPictureHost extends Window {
  documentPictureInPicture?: DocumentPictureInPictureApi;
}

export function getDocumentPictureInPictureApi(win: DocumentPictureInPictureHost = window) {
  return typeof win.documentPictureInPicture?.requestWindow === "function"
    ? win.documentPictureInPicture
    : null;
}

export function copyDocumentStyles(sourceDocument: Document, targetDocument: Document) {
  targetDocument.head.innerHTML = "";

  const styleNodes = sourceDocument.querySelectorAll('link[rel="stylesheet"], style');

  styleNodes.forEach((node) => {
    targetDocument.head.appendChild(node.cloneNode(true));
  });

  targetDocument.documentElement.style.background = "#020617";
  targetDocument.body.style.margin = "0";
  targetDocument.body.style.background = "#020617";
  targetDocument.body.style.color = "#e2e8f0";
}
