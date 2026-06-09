(function () {
  var config = window.LITERATURE_CONFIG || {};
  var contentEl = document.getElementById('literature-results');
  var emptyState = document.querySelector('.literature-empty-state');
  var loadingState = document.querySelector('.literature-loading');

  if (!contentEl) return;

  var PAGE_SIZE = 20;
  var allPapers = [];
  var currentSort = 'relevant';

  function buildApiUrl() {
    var base = config.apiBase ? config.apiBase.replace(/\/+$/, '') : '';
    return base + '/api/literature';
  }

  function truncate(text, maxLen) {
    if (!text) return '';
    return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + '…' : text;
  }

  function formatAuthors(authors) {
    if (!authors || !authors.length) return '';
    var names = authors.map(function (a) { return a.name; });
    if (names.length > 4) return names.slice(0, 3).join(', ') + ' et al.';
    return names.join(', ');
  }

  function sortedPapers(sort) {
    var list = allPapers.slice();
    if (sort === 'recent') {
      list.sort(function (a, b) {
        var da = a.publicationDate || (a.year ? a.year + '-01-01' : '');
        var db = b.publicationDate || (b.year ? b.year + '-01-01' : '');
        return db.localeCompare(da);
      });
    }
    return list.slice(0, PAGE_SIZE);
  }

  function renderPaper(paper) {
    var card = document.createElement('article');
    card.className = 'literature-card';

    var title = document.createElement('h3');
    if (paper.url) {
      var link = document.createElement('a');
      link.href = paper.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = paper.title || 'Untitled';
      title.appendChild(link);
    } else {
      title.textContent = paper.title || 'Untitled';
    }
    card.appendChild(title);

    var meta = document.createElement('p');
    meta.className = 'literature-meta';
    var parts = [];
    var authors = formatAuthors(paper.authors);
    if (authors) parts.push(authors);
    if (paper.journal && paper.journal.name) parts.push(paper.journal.name);
    if (paper.publicationDate) {
      parts.push(paper.publicationDate.slice(0, 7));
    } else if (paper.year) {
      parts.push(paper.year);
    }
    meta.textContent = parts.join(' · ');
    card.appendChild(meta);

    if (paper.abstract) {
      var abstract = document.createElement('p');
      abstract.className = 'literature-abstract';
      abstract.textContent = truncate(paper.abstract, 280);
      card.appendChild(abstract);
    }

    return card;
  }

  function renderResults() {
    contentEl.innerHTML = '';
    var papers = sortedPapers(currentSort);
    papers.forEach(function (paper) {
      contentEl.appendChild(renderPaper(paper));
    });
  }

  function renderControls() {
    var controls = document.getElementById('literature-controls');
    if (!controls) return;

    function makeBtn(label, sort) {
      var btn = document.createElement('button');
      btn.textContent = label;
      btn.className = 'literature-sort-btn' + (currentSort === sort ? ' active' : '');
      btn.addEventListener('click', function () {
        if (currentSort === sort) return;
        currentSort = sort;
        controls.querySelectorAll('.literature-sort-btn').forEach(function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        renderResults();
      });
      return btn;
    }

    controls.appendChild(makeBtn('Most Relevant', 'relevant'));
    controls.appendChild(makeBtn('Most Recent', 'recent'));
  }

  function showEmpty(message) {
    if (loadingState) loadingState.style.display = 'none';
    if (emptyState) {
      emptyState.style.display = 'block';
      emptyState.querySelector('p').textContent = message || 'No recent papers found.';
    }
  }

  fetch(buildApiUrl())
    .then(function (response) {
      if (!response.ok) throw new Error('Literature API failed: ' + response.status);
      return response.json();
    })
    .then(function (data) {
      if (loadingState) loadingState.style.display = 'none';

      if (data.noSeeds) {
        return showEmpty('Add seed papers to the spreadsheet to start surfacing relevant literature.');
      }
      if (!data.papers || !data.papers.length) {
        return showEmpty('No recent papers found — try adding more seed papers.');
      }

      allPapers = data.papers;
      renderControls();
      renderResults();
    })
    .catch(function (error) {
      console.warn('Literature load error', error);
      showEmpty('Unable to load literature right now. Try again later.');
    });
})();
