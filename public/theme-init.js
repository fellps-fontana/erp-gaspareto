try {
  if (localStorage.getItem('erp-gaspareto-theme') === 'dark') {
    document.body.classList.add('dark-theme');
  }
} catch (_) {}
