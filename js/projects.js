(function () {
  var config = window.PROJECTS_DOC || {};
  var docId = config.docId || '';
  var contentEl = document.getElementById('projects-content');
  var emptyState = document.querySelector('.projects-empty-state');

  if (!contentEl) return;

  function buildApiUrl() {
    var base = config.apiBase ? config.apiBase.replace(/\/+$/, '') : '';
    var url = base + '/api/background';
    if (docId) url += '?docId=' + encodeURIComponent(docId);
    return url;
  }

  function appendHtml(target, html) {
    if (!html) return;
    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    while (wrapper.firstChild) target.appendChild(wrapper.firstChild);
  }

  function appendBlocks(target, blocks) {
    (blocks || []).forEach(function (html) { appendHtml(target, html); });
  }

  function renderSections(sections) {
    contentEl.innerHTML = '';
    sections.forEach(function (section) {
      var sectionEl = document.createElement('section');
      sectionEl.id = section.id;

      var h2 = document.createElement('h2');
      h2.textContent = section.title;
      sectionEl.appendChild(h2);

      appendBlocks(sectionEl, section.blocks);

      (section.subsections || []).forEach(function (sub) {
        var h3 = document.createElement('h3');
        h3.id = sub.id;
        h3.textContent = sub.title;
        sectionEl.appendChild(h3);
        appendBlocks(sectionEl, sub.blocks);
      });

      contentEl.appendChild(sectionEl);
    });
  }

  fetch(buildApiUrl())
    .then(function (response) {
      if (!response.ok) throw new Error('Projects API failed: ' + response.status);
      return response.json();
    })
    .then(function (data) {
      if (!data || !Array.isArray(data.sections) || !data.sections.length) {
        throw new Error('No projects found in document.');
      }
      renderSections(data.sections);
      if (emptyState) emptyState.style.display = 'none';
    })
    .catch(function (error) {
      console.warn('Projects load error', error);
      if (emptyState) {
        emptyState.style.display = 'block';
        emptyState.innerHTML = '<p>' + (error.message || 'Unable to load projects right now.') + '</p>';
      }
    });
})();
