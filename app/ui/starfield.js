(function() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.id = 'starfield-canvas';
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.zIndex = '-1';
  canvas.style.pointerEvents = 'none';
  document.body.appendChild(canvas);

  let width, height;
  const stars = [];
  const starCount = 180;

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
  }

  function createStar() {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.5 + 0.5,
      opacity: Math.random(),
      speed: Math.random() * 0.02 + 0.005
    };
  }

  function init() {
    resize();
    for (let i = 0; i < starCount; i++) {
      stars.push(createStar());
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'white';
    
    stars.forEach(star => {
      star.opacity += star.speed;
      if (star.opacity > 1 || star.opacity < 0) {
        star.speed *= -1;
      }
      
      ctx.globalAlpha = Math.max(0, star.opacity);
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
      
      // Soft red halo
      ctx.globalAlpha = Math.max(0, star.opacity * 0.3);
      ctx.fillStyle = 'rgba(220, 40, 40, 0.5)';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'white';
    });
    
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  init();
  draw();
})();