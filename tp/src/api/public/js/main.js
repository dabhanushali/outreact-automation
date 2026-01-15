// Outreach Admin - Main JavaScript

// Auto-refresh dashboard stats every 30 seconds
if (window.location.pathname === '/') {
  setInterval(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(data => {
        // Update stats if elements exist
        const updateStat = (selector, value) => {
          const element = document.querySelector(selector);
          if (element) element.textContent = value;
        };
        // Could update live stats here if needed
      })
      .catch(err => console.error('Failed to fetch stats:', err));
  }, 30000);
}

// Confirm before delete actions
document.addEventListener('click', function(e) {
  const deleteBtn = e.target.closest('form[action*="delete"]');
  if (deleteBtn && !deleteBtn.dataset.confirmed) {
    e.preventDefault();
    if (confirm(deleteBtn.dataset.confirm || 'Are you sure you want to delete this item?')) {
      deleteBtn.dataset.confirmed = 'true';
      deleteBtn.submit();
    }
  }
});

// Auto-resize textarea inputs
document.addEventListener('input', function(e) {
  if (e.target.tagName === 'TEXTAREA') {
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  }
});

// Select all checkbox functionality
function toggleAll(source) {
  const checkboxes = document.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(cb => {
    if (cb !== source) cb.checked = source.checked;
  });
}

// Bulk action helper
function getSelectedIds() {
  const checked = document.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(checked).map(cb => cb.value);
}

// Show toast notification
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast align-items-center text-white bg-${type} border-0`;
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;

  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  container.appendChild(toast);

  const bsToast = new bootstrap.Toast(toast, { delay: 3000 });
  bsToast.show();

  toast.addEventListener('hidden.bs.toast', () => {
    toast.remove();
  });
}

// Format date helper
function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Copy to clipboard helper
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Failed to copy', 'danger');
  });
}

// Export table data as CSV
function exportTableToCSV(tableId, filename = 'export.csv') {
  const table = document.querySelector(tableId);
  if (!table) return;

  const rows = Array.from(table.querySelectorAll('tr'));
  const csv = rows.map(row => {
    const cells = Array.from(row.querySelectorAll('th, td'));
    return cells.map(cell => {
      // Get text content and escape quotes
      let text = cell.textContent.trim();
      text = text.replace(/"/g, '""');
      // Put text in quotes if it contains comma or quote
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        text = `"${text}"`;
      }
      return text;
    }).join(',');
  }).join('\n');

  // Create download link
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);

  showToast('Exported successfully!', 'success');
}

// Initialize tooltips
document.addEventListener('DOMContentLoaded', function() {
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(function(tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// Loading indicator helper
function showLoading(btn) {
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';
  return () => {
    btn.disabled = false;
    btn.innerHTML = originalText;
  };
}

// Debounce helper for search inputs
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Auto-submit form on search input change (debounced)
document.addEventListener('DOMContentLoaded', function() {
  const searchInputs = document.querySelectorAll('input[name="search"]');
  searchInputs.forEach(input => {
    let timeout;
    input.addEventListener('input', debounce(function(e) {
      const form = e.target.closest('form');
      if (form) {
        form.submit();
      }
    }, 500));
  });
});

console.log('Outreach Admin loaded successfully!');
