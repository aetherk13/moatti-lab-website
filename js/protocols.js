(function () {
  var searchInput = document.getElementById('protocol-search');
  var cards = Array.prototype.slice.call(document.querySelectorAll('.protocol-card'));
  var emptyState = document.querySelector('.protocol-empty-state');

  if (!searchInput || !cards.length) {
    return;
  }

  function applyFilter() {
    var query = searchInput.value.trim().toLowerCase();
    var visible = 0;

    cards.forEach(function (card) {
      var haystack = (card.getAttribute('data-search') || card.textContent || '').toLowerCase();
      var matches = !query || haystack.indexOf(query) !== -1;
      if (matches) {
        card.classList.remove('is-hidden');
        visible += 1;
      } else {
        card.classList.add('is-hidden');
      }
    });

    if (emptyState) {
      emptyState.style.display = visible ? 'none' : 'block';
    }
  }

  searchInput.addEventListener('input', applyFilter);
  applyFilter();
})();
