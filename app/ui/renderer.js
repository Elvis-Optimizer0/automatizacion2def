const importBtn = document.getElementById('import-btn');
const dropZone = document.getElementById('drop-zone');
const imagesList = document.getElementById('images-list');
const toastContainer = document.getElementById('toast-container');

let importedImages = [];

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.2s ease reverse';
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

function renderImages() {
  imagesList.innerHTML = '';

  importedImages.forEach((image, _index) => {
    const item = document.createElement('article');
    item.className = 'image-item';
    item.setAttribute('role', 'listitem');

    const thumbnail = document.createElement('img');
    thumbnail.className = 'image-thumbnail';
    thumbnail.src = `file://${image.path}`;
    thumbnail.alt = `Miniatura de ${image.name}`;
    thumbnail.loading = 'lazy';

    thumbnail.onerror = () => {
      thumbnail.style.display = 'none';
    };

    const info = document.createElement('div');
    info.className = 'image-info';

    const name = document.createElement('div');
    name.className = 'image-name';
    name.textContent = image.name;
    name.title = image.name;

    const path = document.createElement('div');
    path.className = 'image-path';
    path.textContent = image.path;
    path.title = image.path;

    info.appendChild(name);
    info.appendChild(path);
    item.appendChild(thumbnail);
    item.appendChild(info);
    imagesList.appendChild(item);
  });
}

async function handleFiles(filePaths) {
  const newImages = filePaths.map(filePath => ({
    name: filePath.name,
    path: filePath.path
  }));

  importedImages = [...importedImages, ...newImages];
  renderImages();
  showToast(`${newImages.length} imagen(es) importada(s)`, 'success');
}

importBtn.addEventListener('click', async () => {
  try {
    const files = await window.api.openImages();
    if (files.length > 0) {
      await handleFiles(files);
    }
  } catch (error) {
    console.error('Error importing images:', error);
    showToast('Error al importar imágenes', 'error');
  }
});

dropZone.addEventListener('click', (e) => {
  if (e.target === dropZone || dropZone.contains(e.target)) {
    importBtn.click();
  }
});

dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    importBtn.click();
  }
});

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, false);
});

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => {
    dropZone.classList.add('drag-active');
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => {
    dropZone.classList.remove('drag-active');
  }, false);
});

dropZone.addEventListener('drop', async (e) => {
  const files = Array.from(e.dataTransfer.files).filter(file =>
    file.type.startsWith('image/')
  );

  if (files.length === 0) {
    showToast('No se detectaron archivos de imagen válidos', 'warning');
    return;
  }

  try {
    const filePaths = [];
    for (const file of files) {
      const path = window.api.getPathForFile(file);
      filePaths.push({ name: file.name, path });
    }
    await handleFiles(filePaths);
  } catch (error) {
    console.error('Error processing dropped files:', error);
    showToast('Error al procesar archivos', 'error');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  console.log('Video Maker v0.1.0 - Renderer loaded');
});