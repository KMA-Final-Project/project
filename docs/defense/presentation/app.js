const slides = Array.from(document.querySelectorAll(".slide"));
const currentSlideLabel = document.getElementById("current-slide");
const totalSlidesLabel = document.getElementById("total-slides");
const progressFill = document.getElementById("progress-fill");
const slideDots = document.getElementById("slide-dots");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const slideShells = Array.from(document.querySelectorAll(".slide-shell"));

let currentIndex = 0;

function getInitialSlideIndex() {
  const params = new URLSearchParams(window.location.search);
  const rawFromQuery = params.get("slide");
  const rawFromHash = window.location.hash.startsWith("#slide-")
    ? window.location.hash.replace("#slide-", "")
    : "";
  const raw = rawFromQuery || rawFromHash;
  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(Math.max(parsed - 1, 0), slides.length - 1);
}

function buildDots() {
  slideDots.innerHTML = "";
  slides.forEach((slide, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dot";
    button.setAttribute("aria-label", `Đi tới slide ${index + 1}`);
    button.addEventListener("click", () => goToSlide(index));
    slideDots.appendChild(button);
  });
}

function updateSlides() {
  slides.forEach((slide, index) => {
    slide.classList.toggle("is-active", index === currentIndex);
  });

  slideShells.forEach((shell, index) => {
    if (index === currentIndex) {
      shell.scrollTop = 0;
    }
  });

  const dots = Array.from(document.querySelectorAll(".dot"));
  dots.forEach((dot, index) => {
    dot.classList.toggle("is-active", index === currentIndex);
  });

  currentSlideLabel.textContent = String(currentIndex + 1);
  totalSlidesLabel.textContent = String(slides.length);
  progressFill.style.width = `${((currentIndex + 1) / slides.length) * 100}%`;

  prevBtn.disabled = currentIndex === 0;
  nextBtn.disabled = currentIndex === slides.length - 1;

  const url = new URL(window.location.href);
  url.searchParams.set("slide", String(currentIndex + 1));
  url.hash = `slide-${currentIndex + 1}`;
  window.history.replaceState({}, "", url);

  document.title = `Slide ${currentIndex + 1} / ${slides.length} - Defense Presentation`;
}

function goToSlide(index) {
  if (index < 0 || index >= slides.length) {
    return;
  }

  currentIndex = index;
  updateSlides();
}

function nextSlide() {
  goToSlide(Math.min(currentIndex + 1, slides.length - 1));
}

function prevSlide() {
  goToSlide(Math.max(currentIndex - 1, 0));
}

async function toggleFullscreen() {
  if (!document.fullscreenEnabled) {
    return;
  }

  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }

  await document.documentElement.requestFullscreen();
}

function onKeydown(event) {
  const blocked = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName || "");
  if (blocked) {
    return;
  }

  switch (event.key) {
    case "ArrowRight":
    case "PageDown":
    case " ":
      event.preventDefault();
      nextSlide();
      break;
    case "ArrowLeft":
    case "PageUp":
      event.preventDefault();
      prevSlide();
      break;
    case "Home":
      event.preventDefault();
      goToSlide(0);
      break;
    case "End":
      event.preventDefault();
      goToSlide(slides.length - 1);
      break;
    case "f":
    case "F":
      event.preventDefault();
      toggleFullscreen();
      break;
    default:
      break;
  }
}

prevBtn.addEventListener("click", prevSlide);
nextBtn.addEventListener("click", nextSlide);
fullscreenBtn.addEventListener("click", () => {
  toggleFullscreen().catch(() => {});
});

document.addEventListener("keydown", onKeydown);
document.addEventListener("fullscreenchange", () => {
  fullscreenBtn.textContent = document.fullscreenElement ? "⤢" : "⛶";
});

currentIndex = getInitialSlideIndex();
buildDots();
updateSlides();
