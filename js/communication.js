(function () {
  var config = window.LINKS_CONFIG || {};
  var container = document.getElementById('links-sections');
  var emptyState = document.querySelector('.links-empty-state');
  var loadingState = document.querySelector('.links-loading');

  if (!container) return;

  function buildApiUrl() {
    var base = config.apiBase ? config.apiBase.replace(/\/+$/, '') : '';
    var url = base + '/api/links';
    if (config.sheetId) url += '?sheetId=' + encodeURIComponent(config.sheetId);
    return url;
  }

  function slugify(text) {
    return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
  }

  function renderCard(link) {
    var card = document.createElement('a');
    card.className = 'link-card';
    card.href = link.url || '#';
    if (link.url) {
      card.target = '_blank';
      card.rel = 'noopener';
    }

    var top = document.createElement('div');
    top.className = 'link-card-top';

    var title = document.createElement('span');
    title.className = 'link-card-title';
    title.textContent = link.title;
    top.appendChild(title);

    var arrow = document.createElement('span');
    arrow.className = 'link-card-arrow';
    arrow.innerHTML = '&#8599;';
    top.appendChild(arrow);

    card.appendChild(top);

    if (link.description) {
      var desc = document.createElement('p');
      desc.className = 'link-card-desc';
      desc.textContent = link.description;
      card.appendChild(desc);
    }

    if (link.domain) {
      var domain = document.createElement('span');
      domain.className = 'link-card-domain';
      domain.textContent = link.domain;
      card.appendChild(domain);
    }

    return card;
  }

  function renderCategory(category) {
    var section = document.createElement('section');
    section.className = 'links-category';
    section.id = slugify(category.title);

    var heading = document.createElement('h2');
    heading.className = 'links-category-title';
    heading.textContent = category.title;
    section.appendChild(heading);

    var grid = document.createElement('div');
    grid.className = 'links-grid';

    category.links.forEach(function (link) {
      grid.appendChild(renderCard(link));
    });

    section.appendChild(grid);
    return section;
  }

  function showEmpty(message) {
    if (loadingState) loadingState.style.display = 'none';
    if (emptyState) {
      emptyState.style.display = 'block';
      emptyState.querySelector('p').textContent = message || 'No links available yet.';
    }
  }

  fetch(buildApiUrl())
    .then(function (r) {
      if (!r.ok) throw new Error('Links API failed: ' + r.status);
      return r.json();
    })
    .then(function (data) {
      if (loadingState) loadingState.style.display = 'none';
      if (!data.categories || !data.categories.length) {
        return showEmpty('No links yet — add some to the spreadsheet.');
      }
      data.categories.forEach(function (cat) {
        container.appendChild(renderCategory(cat));
      });
    })
    .catch(function (err) {
      console.warn('Links load error', err);
      showEmpty('Unable to load links right now.');
    });
})();
