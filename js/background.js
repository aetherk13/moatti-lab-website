(function () {
  var config = window.BACKGROUND_DOC || {};
  var docId = config.docId || '';
  var contentEl = document.getElementById('background-content');
  var navList = document.getElementById('background-nav-list');
  var emptyState = document.querySelector('.background-empty-state');

  if (!contentEl || !navList) {
    return;
  }

  function buildApiUrl() {
    var base = '';
    if (config.apiBase) {
      base = config.apiBase.replace(/\/+$/, '');
    }
    var url = base + '/api/background';
    if (docId) {
      url += '?docId=' + encodeURIComponent(docId);
    }
    return url;
  }

  function appendHtml(target, html) {
    if (!html) {
      return;
    }
    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    while (wrapper.firstChild) {
      target.appendChild(wrapper.firstChild);
    }
  }

  function appendBlocks(target, blocks) {
    (blocks || []).forEach(function (html) {
      appendHtml(target, html);
    });
  }

  function renderNavItem(text, href, className) {
    var li = document.createElement('li');
    if (className) {
      li.className = className;
    }
    var link = document.createElement('a');
    link.href = href;
    link.textContent = text;
    li.appendChild(link);
    navList.appendChild(li);
  }

  function renderSections(sections) {
    contentEl.innerHTML = '';
    navList.innerHTML = '';

    sections.forEach(function (section) {
      var sectionEl = document.createElement('section');
      sectionEl.id = section.id;

      var header = document.createElement('header');
      var h2 = document.createElement('h2');
      h2.textContent = section.title;
      header.appendChild(h2);
      sectionEl.appendChild(header);

      appendBlocks(sectionEl, section.blocks);
      renderNavItem(section.title, '#' + section.id);

      (section.subsections || []).forEach(function (sub) {
        var h3 = document.createElement('h3');
        h3.id = sub.id;
        h3.textContent = sub.title;
        sectionEl.appendChild(h3);
        appendBlocks(sectionEl, sub.blocks);
        renderNavItem(sub.title, '#' + sub.id, 'subnav');
      });

      contentEl.appendChild(sectionEl);
    });
  }

  function showError(message) {
    if (navList) {
      navList.innerHTML = '<li>Unable to load topics</li>';
    }
    if (emptyState) {
      emptyState.style.display = 'block';
      emptyState.innerHTML = '<p>' + (message || 'Unable to load primers right now.') + '</p>';
    }
  }

  fetch(buildApiUrl())
    .then(function (response) {
      if (!response.ok) {
        throw new Error('Background API failed: ' + response.status);
      }
      return response.json();
    })
    .then(function (data) {
      if (!data || !Array.isArray(data.sections) || !data.sections.length) {
        throw new Error('No sections found in document.');
      }
      renderSections(data.sections);
      if (emptyState) {
        emptyState.style.display = 'none';
      }
    })
    .catch(function (error) {
      console.warn('Background load error', error);
      showError(error.message);
    });
})();
