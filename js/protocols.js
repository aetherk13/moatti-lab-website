(function () {
  var grid = document.getElementById('protocol-grid');
  var searchInput = document.getElementById('protocol-search');
  var emptyState = document.querySelector('.protocol-empty-state');
  var cards = [];
  var config = window.PROTOCOL_SHEET || {};

  var FALLBACK_PROTOCOLS = [];

  if (!grid) {
    return;
  }

  var DEFAULT_IMAGE = 'images/lab-logo.jpeg';
  var driveCache = {};

  function formatDate(input) {
    if (!input) {
      return 'Date TBD';
    }
    var parsed = new Date(input);
    if (!isNaN(parsed.getTime())) {
      var options = { month: 'short', day: '2-digit', year: 'numeric' };
      return parsed.toLocaleDateString('en-US', options).replace(',', '');
    }
    return input || 'Date TBD';
  }

  function buildSearchString(item) {
    return [item.title, item.summary, item.category, item.tags]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  function createCard(item) {
    var column = document.createElement('div');
    column.className = '3u';

    var section = document.createElement('section');
    section.className = 'card protocol-card';
    section.setAttribute('data-search', buildSearchString(item));

    var img = document.createElement('img');
    img.className = 'protocol-thumb';
    img.src = item.image || DEFAULT_IMAGE;
    img.alt = item.title;
    console.log('Protocol image URL:', item.title, item.image);
    section.appendChild(img);

    var title = document.createElement('h3');
    title.textContent = item.title;
    section.appendChild(title);

    var summary = document.createElement('p');
    summary.textContent = item.summary || 'Full protocol coming soon.';
    section.appendChild(summary);

    var meta = document.createElement('p');
    meta.className = 'protocol-meta';
    meta.innerHTML = '<strong>Updated:</strong> ' + formatDate(item.updated);
    section.appendChild(meta);

    var button = document.createElement('a');
    button.className = 'button button-arrow';
    button.href = item.link || '#';
    button.textContent = 'Open protocol';
    section.appendChild(button);

    column.appendChild(section);
    return column;
  }

  function renderProtocols(list) {
    grid.innerHTML = '';
    list.forEach(function (item) {
      grid.appendChild(createCard(item));
    });
    cards = Array.prototype.slice.call(grid.querySelectorAll('.protocol-card'));
    applyFilter();
  }

  function applyFilter() {
    var query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if (!cards.length) {
      if (emptyState) {
        emptyState.style.display = 'block';
      }
      return;
    }
    var visible = 0;
    cards.forEach(function (card) {
      var haystack = (card.getAttribute('data-search') || '').toLowerCase();
      var matches = !query || haystack.indexOf(query) !== -1;
      card.classList.toggle('is-hidden', !matches);
      if (matches) {
        visible += 1;
      }
    });
    if (emptyState) {
      emptyState.style.display = visible ? 'none' : 'block';
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', applyFilter);
  }

  function normalizeRow(entry) {
    var title = entry.Title || entry.title || '';
    if (!title) {
      return null;
    }
    var rawImage = entry.Image || entry.image || entry['Image Link'] || entry['image link'] || '';
    return {
      title: title,
      updated: entry.Updated || entry.updated || entry.Date || entry.date || '',
      category: '',
      summary: entry.Summary || entry.summary || entry.Description || entry.description || '',
      image: normalizeImageUrl((rawImage || '').trim()),
      link: entry.Link || entry.link || entry['Protocol Link'] || entry['protocol link'] || '#',
      tags: ''
    };
  }

  function normalizeImageUrl(value) {
    if (!value) {
      return DEFAULT_IMAGE;
    }
    var trimmed = value.trim();
    if (!trimmed) {
      return DEFAULT_IMAGE;
    }
    var directMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/);
    if (directMatch && directMatch[1]) {
      return 'https://drive.google.com/uc?export=view&id=' + directMatch[1];
    }
    var idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch && idMatch[1]) {
      return 'https://drive.google.com/uc?export=view&id=' + idMatch[1];
    }
    return trimmed;
  }

  function parseSheetResponse(raw) {
    try {
      if (!raw) {
        return [];
      }
      var start = raw.indexOf('{');
      var end = raw.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) {
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
            entry[key] = cell && cell.v ? cell.v : '';
          });
          return normalizeRow(entry);
        })
        .filter(Boolean);
    } catch (err) {
      console.warn('Unable to parse Google Sheet response', err);
      return [];
    }
  }

  function parseCSV(text) {
    var rows = [];
    var current = '';
    var inQuotes = false;
    var row = [];

    for (var i = 0; i < text.length; i += 1) {
      var char = text[i];
      if (char === '"') {
        if (inQuotes && text[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(current);
        current = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (current || row.length) {
          row.push(current);
          rows.push(row);
          row = [];
          current = '';
        }
      } else {
        current += char;
      }
    }
    if (current || row.length) {
      row.push(current);
      rows.push(row);
    }

    if (!rows.length) {
      return [];
    }
    var headers = rows.shift().map(function (cell) {
      return (cell || '').trim();
    });
    return rows
      .map(function (cols) {
        if (!cols.some(function (cell) { return cell && cell.trim(); })) {
          return null;
        }
        var entry = {};
        headers.forEach(function (header, idx) {
          entry[header] = cols[idx] ? cols[idx].trim() : '';
        });
        return normalizeRow(entry);
      })
      .filter(Boolean);
  }

  function loadFromGViz() {
    var sheetId = config.sheetId;
    if (!sheetId) {
      return Promise.resolve([]);
    }
    var sheetParam = '';
    if (config.gid) {
      sheetParam += '&gid=' + encodeURIComponent(config.gid);
    } else if (config.sheetName) {
      sheetParam += '&sheet=' + encodeURIComponent(config.sheetName);
    }
    var url = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/gviz/tq?tqx=out:json' + sheetParam;
    return fetch(url)
      .then(function (response) {
        if (!response.ok) {
          throw new Error('GViz fetch failed: ' + response.status);
        }
        return response.text();
      })
      .then(parseSheetResponse);
  }

  function loadFromCSV() {
    var sheetId = config.sheetId;
    if (!sheetId) {
      return Promise.resolve([]);
    }
    var gid = config.gid ? encodeURIComponent(config.gid) : '0';
    var url = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/export?format=csv&gid=' + gid;
    return fetch(url)
      .then(function (response) {
        if (!response.ok) {
          throw new Error('CSV fetch failed: ' + response.status);
        }
        return response.text();
      })
      .then(parseCSV);
  }

  function fetchProtocols() {
    if (!config.sheetId) {
      console.warn('No Google Sheet configured for protocols.');
      renderProtocols(FALLBACK_PROTOCOLS);
      return;
    }

    function processRows(rows) {
      if (!rows || !rows.length) {
        return Promise.resolve(false);
      }
      rows.forEach(function (item) {
        if (!item.image) {
          item.image = DEFAULT_IMAGE;
        }
      });
      renderProtocols(rows);
      return Promise.resolve(true);
    }

    loadFromGViz()
      .then(function (rows) {
        return processRows(rows);
      })
      .then(function (success) {
        if (success) {
          return true;
        }
        return loadFromCSV().then(processRows);
      })
      .then(function (success) {
        if (!success) {
          renderProtocols(FALLBACK_PROTOCOLS);
        }
      })
      .catch(function (error) {
        console.warn('Unable to load Google Sheet. Showing empty protocol list.', error);
        renderProtocols(FALLBACK_PROTOCOLS);
      });
  }

  fetchProtocols();
})();
