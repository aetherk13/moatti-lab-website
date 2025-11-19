(function () {
  var sections = document.getElementById('communication-sections');
  var emptyState = document.querySelector('.communication-empty-state');
  var config = window.COMMUNICATION_SHEET || {};

  if (!sections || !config.sheetId || !Array.isArray(config.categories) || !config.categories.length) {
    if (emptyState) {
      emptyState.style.display = 'block';
    }
    return;
  }

  function slugify(value) {
    return (value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section';
  }

  function toTitleCase(value) {
    return value
      .toLowerCase()
      .split(' ')
      .filter(Boolean)
      .map(function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  function humanizeSlug(slug) {
    if (!slug) {
      return '';
    }
    var decoded = decodeURIComponent(slug);
    return decoded.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function fallbackTitleFromUrl(url) {
    if (!url) {
      return 'Resource';
    }
    try {
      var parsed = new URL(url);
      var segments = parsed.pathname.split('/').filter(Boolean);
      var base = segments.length ? segments[segments.length - 1] : parsed.hostname.replace(/^www\./, '');
      base = base.replace(/\.[a-z0-9]+$/i, '');
      var humanized = humanizeSlug(base);
      return humanized ? toTitleCase(humanized) : parsed.hostname.replace(/^www\./, '');
    } catch (err) {
      return url;
    }
  }

  function valueFromFields(entry, fields) {
    for (var i = 0; i < fields.length; i += 1) {
      var key = fields[i];
      if (!Object.prototype.hasOwnProperty.call(entry, key)) {
        continue;
      }
      var value = entry[key];
      if (value !== undefined && value !== null && value !== '') {
        return typeof value === 'string' ? value : String(value);
      }
    }
    return '';
  }

  function findFirstUrl(entry) {
    var urlPattern = /(https?:\/\/[^\s]+)/i;
    for (var key in entry) {
      if (!Object.prototype.hasOwnProperty.call(entry, key)) {
        continue;
      }
      var value = entry[key];
      if (typeof value === 'string' && urlPattern.test(value)) {
        var match = value.match(urlPattern);
        return match ? match[0] : value.trim();
      }
    }
    return '';
  }

  function normalizeResource(entry) {
    if (!entry) {
      return null;
    }
    var link = valueFromFields(entry, ['Link', 'URL', 'Resource Link', 'Resource', 'Website']).trim();
    if (!link) {
      link = findFirstUrl(entry);
    }
    link = (link || '').trim();
    var title = valueFromFields(entry, ['Title', 'Name', 'Resource', 'Topic', 'Headline']).trim();
    var summary = valueFromFields(entry, ['Description', 'Summary', 'Notes', 'Details']).trim();
    var tags = valueFromFields(entry, ['Tags', 'Category']).trim();

    if (!title && summary) {
      title = summary;
      summary = '';
    }
    if (!title && link) {
      title = fallbackTitleFromUrl(link);
    }
    if (!title) {
      var firstValue = valueFromFields(entry, Object.keys(entry));
      title = firstValue || 'Resource';
    }

    if (!link && !title) {
      return null;
    }

    return {
      title: title,
      summary: summary || '',
      link: link || '',
      tags: tags
    };
  }

  function normalizeCellValue(cell) {
    if (!cell) {
      return '';
    }
    if (cell.v !== undefined && cell.v !== null) {
      return cell.v;
    }
    if (cell.f) {
      return cell.f;
    }
    return '';
  }

  function parseSheetResponse(raw) {
    try {
      var start = raw.indexOf('{');
      var end = raw.lastIndexOf('}');
      if (start === -1 || end === -1) {
        return [];
      }
      var trimmed = raw.slice(start, end + 1);
      var json = JSON.parse(trimmed);
      var cols = json.table.cols.map(function (col, idx) {
        return (col.label || 'Column' + idx).trim();
      });
      return json.table.rows
        .map(function (row) {
          if (!row.c) {
            return null;
          }
          var entry = {};
          row.c.forEach(function (cell, idx) {
            var key = cols[idx];
            entry[key] = normalizeCellValue(cell);
          });
          return entry;
        })
        .filter(function (entry) {
          return entry && Object.keys(entry).some(function (key) {
            return entry[key];
          });
        });
    } catch (err) {
      console.warn('Unable to parse communication sheet response', err);
      return [];
    }
  }

  function fetchCategory(category) {
    var url = 'https://docs.google.com/spreadsheets/d/' +
      config.sheetId +
      '/gviz/tq?tqx=out:json&gid=' +
      encodeURIComponent(category.gid);
    return fetch(url)
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Sheet fetch failed: ' + response.status);
        }
        return response.text();
      })
      .then(parseSheetResponse)
      .then(function (rows) {
        return rows.map(normalizeResource).filter(Boolean);
      });
  }

  function createResourceList(resources) {
    var list = document.createElement('ul');
    list.className = 'communication-resource-list';
    resources.forEach(function (resource) {
      var item = document.createElement('li');

      var link = document.createElement('a');
      link.href = resource.link || '#';
      if (resource.link) {
        link.target = '_blank';
        link.rel = 'noopener';
      }
      link.textContent = resource.title;
      link.className = 'communication-resource-link';
      item.appendChild(link);

      if (resource.summary) {
        var summary = document.createElement('p');
        summary.className = 'communication-resource-summary';
        summary.textContent = resource.summary;
        item.appendChild(summary);
      }

      if (resource.tags) {
        var meta = document.createElement('p');
        meta.className = 'communication-resource-meta';
        meta.textContent = resource.tags;
        item.appendChild(meta);
      }

      list.appendChild(item);
    });
    return list;
  }

  function renderCategoryBlock(category, resources) {
    var section = document.createElement('section');
    section.className = 'communication-category card';
    section.id = slugify(category.title);
    if (category.accent) {
      section.style.setProperty('--communication-accent', category.accent);
    }

    var header = document.createElement('header');
    header.className = 'communication-category-header';

    var heading = document.createElement('h2');
    heading.className = 'communication-category-title';
    heading.textContent = category.title;
    header.appendChild(heading);

    var description = document.createElement('p');
    description.className = 'communication-category-description';
    description.textContent = category.description || '';
    header.appendChild(description);

    section.appendChild(header);

    if (resources.length) {
      section.appendChild(createResourceList(resources));
    } else {
      var empty = document.createElement('p');
      empty.className = 'communication-category-empty';
      empty.textContent = 'Resources coming soon for this category.';
      section.appendChild(empty);
    }

    return section;
  }

  var requests = config.categories.map(function (category) {
    return fetchCategory(category)
      .then(function (resources) {
        return { category: category, resources: resources };
      })
      .catch(function (error) {
        console.warn('Unable to load communication category', category.title, error);
        return { category: category, resources: [] };
      });
  });

  Promise.all(requests)
    .then(function (results) {
      var hasResources = false;
      results.forEach(function (result) {
        sections.appendChild(renderCategoryBlock(result.category, result.resources));
        if (result.resources.length) {
          hasResources = true;
        }
      });
      if (emptyState) {
        emptyState.style.display = hasResources ? 'none' : 'block';
      }
    })
    .catch(function (error) {
      console.warn('Unable to load communication resources', error);
      if (emptyState) {
        emptyState.style.display = 'block';
      }
    });
})();
