const pagesArea = document.querySelector("#pages");
const createButton = document.querySelector("#create");
const status = document.querySelector("#status");
let pages = [];
let submitted = false;

function movePage(source, target) {
  if (source === target || source < 0 || target < 0 || source >= pages.length || target >= pages.length) return;
  const [page] = pages.splice(source, 1);
  pages.splice(target, 0, page);
  render();
}

function render() {
  const scrollTop = pagesArea.scrollTop;
  pagesArea.replaceChildren();
  pages.forEach((page, index) => {
    const card = document.createElement("article");
    card.className = "page-card";
    card.draggable = true;
    card.tabIndex = 0;
    card.setAttribute("aria-label", `Output page ${index + 1}: ${page.filename}, source page ${page.pageNumber}. Drag to reorder.`);
    const top = document.createElement("div");
    top.className = "card-top";
    const number = document.createElement("span");
    number.className = "number";
    number.textContent = String(index + 1);
    const caption = document.createElement("span");
    caption.className = "page-caption";
    caption.textContent = page.pageNumber > 1 ? `Source page ${page.pageNumber}` : "Page preview";
    top.append(number, caption);
    const thumbnail = document.createElement("div");
    thumbnail.className = "thumbnail";
    if (page.preview) {
      const image = document.createElement("img");
      image.src = page.preview;
      image.alt = `${page.filename} page ${page.pageNumber}`;
      thumbnail.append(image);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "placeholder";
      placeholder.textContent = `PDF page ${page.pageNumber}\nPreview unavailable`;
      thumbnail.append(placeholder);
    }
    const bottom = document.createElement("div");
    bottom.className = "card-bottom";
    const filename = document.createElement("span");
    filename.className = "filename";
    filename.title = page.filename;
    filename.textContent = page.filename;
    const left = document.createElement("button");
    left.type = "button";
    left.textContent = "←";
    left.title = "Move this page earlier";
    left.setAttribute("aria-label", `Move page ${index + 1} earlier`);
    left.disabled = index === 0;
    left.addEventListener("click", () => movePage(index, index - 1));
    const right = document.createElement("button");
    right.type = "button";
    right.textContent = "→";
    right.title = "Move this page later";
    right.setAttribute("aria-label", `Move page ${index + 1} later`);
    right.disabled = index === pages.length - 1;
    right.addEventListener("click", () => movePage(index, index + 1));
    bottom.append(filename, left, right);
    card.append(top, thumbnail, bottom);
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", page.id);
      event.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("dragover", (event) => { event.preventDefault(); card.classList.add("over"); });
    card.addEventListener("dragleave", () => card.classList.remove("over"));
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      card.classList.remove("over");
      const source = pages.findIndex((item) => item.id === event.dataTransfer.getData("text/plain"));
      movePage(source, pages.findIndex((item) => item.id === page.id));
    });
    card.addEventListener("keydown", (event) => {
      if (event.altKey && event.key === "ArrowLeft") { event.preventDefault(); movePage(index, index - 1); }
      if (event.altKey && event.key === "ArrowRight") { event.preventDefault(); movePage(index, index + 1); }
    });
    pagesArea.append(card);
  });
  pagesArea.scrollTop = scrollTop;
}

function submit(order) {
  if (submitted) return;
  submitted = true;
  window.pdfrootDesktop.choosePageOrder(order);
}
createButton.addEventListener("click", () => { if (pages.length) submit(pages.map((page) => page.id)); });
document.querySelector("#cancel").addEventListener("click", () => submit(null));
document.querySelector("#close").addEventListener("click", () => submit(null));
window.addEventListener("keydown", (event) => { if (event.key === "Escape") submit(null); });

window.pdfrootDesktop.onToolActivate(() => {
window.pdfrootDesktop.pageOrderPreviews().then((result) => {
  if (!Array.isArray(result?.pages) || !result.pages.length) throw new Error(result?.error || "No pages found in the selected files.");
  pages = result.pages;
  const mode = result.slug === "merge-pdf" ? "Merge PDF" : "JPG / Image to PDF";
  document.querySelector("#title").textContent = `Arrange ${pages.length} pages`;
  document.querySelector("#subtitle").textContent = `${mode} · Each numbered card becomes one page in the finished PDF.`;
  createButton.textContent = `Create ${pages.length}-page PDF`;
  createButton.disabled = false;
  status.textContent = result.warnings?.length ? result.warnings.join(" ") : "Drag pages to reorder, or use the arrows. The PDF saves beside the selected files.";
  render();
}).catch((error) => {
  pagesArea.replaceChildren();
  status.textContent = error?.message || "Could not prepare the page preview.";
});

});
