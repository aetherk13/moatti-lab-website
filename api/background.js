'use strict';

const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/drive.readonly'
];

let authClient;

function getEnv(key) {
  return process.env[key] || '';
}

const DEFAULT_DOC_ID = process.env.BACKGROUND_DOC_ID || '179TGgjL3wbSTm-o_xiJRV7QawGmfyY0XuQcrbcJVtW8';

async function getAuth() {
  if (authClient) {
    return authClient;
  }
  const clientEmail = getEnv('GOOGLE_CLIENT_EMAIL');
  const privateKey = getEnv('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw new Error('Google service account credentials are not configured.');
  }

  authClient = new google.auth.JWT(clientEmail, null, privateKey, SCOPES);
  await authClient.authorize();
  return authClient;
}

function escapeHtml(text) {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function applyTextStyles(text, style) {
  if (!text) {
    return '';
  }
  var html = text;
  if (style.link && style.link.url) {
    html = `<a href="${escapeAttr(style.link.url)}" target="_blank" rel="noopener">${html}</a>`;
  }
  if (style.bold) {
    html = `<strong>${html}</strong>`;
  }
  if (style.italic) {
    html = `<em>${html}</em>`;
  }
  if (style.underline) {
    html = `<u>${html}</u>`;
  }
  if (style.strikethrough) {
    html = `<s>${html}</s>`;
  }
  if (style.baselineOffset === 'SUPERSCRIPT') {
    html = `<sup>${html}</sup>`;
  } else if (style.baselineOffset === 'SUBSCRIPT') {
    html = `<sub>${html}</sub>`;
  }
  return html;
}

function renderElement(element, inlineImages) {
  if (element.textRun) {
    var content = (element.textRun.content || '').replace(/\n/g, '');
    if (!content.trim()) {
      return '';
    }
    return applyTextStyles(escapeHtml(content), element.textRun.textStyle || {});
  }
  if (element.inlineObjectElement) {
    var objectId = element.inlineObjectElement.inlineObjectId;
    if (objectId && inlineImages[objectId]) {
      var src = inlineImages[objectId].dataUrl;
      var alt = inlineImages[objectId].alt || '';
      return `<img src="${src}" alt="${escapeAttr(alt)}" class="inline-image">`;
    }
  }
  return '';
}

function renderParagraphElements(paragraph, inlineImages) {
  var elements = paragraph.elements || [];
  return elements
    .map(function (element) {
      if (element.textRun || element.inlineObjectElement) {
        return renderElement(element, inlineImages);
      }
      return '';
    })
    .join('')
    .trim();
}

function getPlainText(paragraph) {
  var elements = paragraph.elements || [];
  return elements
    .map(function (el) {
      if (el.textRun && el.textRun.content) {
        return el.textRun.content.trim();
      }
      return '';
    })
    .join(' ')
    .trim();
}

function slugify(text, counts) {
  var base = (text || 'section')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
  counts[base] = (counts[base] || 0) + 1;
  if (counts[base] > 1) {
    return base + '-' + counts[base];
  }
  return base;
}

function flushList(target) {
  if (target && target.__list && target.__list.items.length) {
    var listHtml = '<ul>' + target.__list.items.map(function (item) {
      return `<li>${item || ''}</li>`;
    }).join('') + '</ul>';
    target.push(listHtml);
  }
  if (target) {
    target.__list = null;
  }
}

function appendParagraph(target, html) {
  if (!target || !html) {
    return;
  }
  flushList(target);
  target.push(`<p>${html}</p>`);
}

function appendListItem(target, listId, html) {
  if (!target) {
    return;
  }
  if (!target.__list || target.__list.id !== listId) {
    flushList(target);
    target.__list = { id: listId, items: [] };
  }
  target.__list.items.push(html || '');
}

function buildSections(content, inlineImages) {
  var sections = [];
  var slugCounts = {};
  var currentSection = null;
  var currentTarget = null;

  (content || []).forEach(function (item) {
    if (!item.paragraph) {
      return;
    }
    var paragraph = item.paragraph;
    var style = paragraph.paragraphStyle || {};
    var namedStyle = style.namedStyleType || '';
    var paragraphHtml = renderParagraphElements(paragraph, inlineImages);
  var plain = getPlainText(paragraph);

    if (namedStyle === 'HEADING_1' || namedStyle === 'HEADING_2') {
      if (currentTarget) {
        flushList(currentTarget);
      }
      currentSection = {
        title: plain || 'Untitled section',
        id: '',
        blocks: [],
        subsections: []
      };
      currentSection.id = slugify(currentSection.title, slugCounts);
      sections.push(currentSection);
      currentTarget = currentSection.blocks;
      return;
    }

    if ((namedStyle === 'HEADING_3' || namedStyle === 'HEADING_4') && currentSection) {
      flushList(currentTarget);
      var subsection = {
        title: plain || 'Subsection',
        id: slugify(plain || 'subsection', slugCounts),
        blocks: []
      };
      currentSection.subsections.push(subsection);
      currentTarget = subsection.blocks;
      return;
    }

    if (!currentSection) {
      currentSection = {
        title: 'Overview',
        id: slugify('overview', slugCounts),
        blocks: [],
        subsections: []
      };
      sections.push(currentSection);
      currentTarget = currentSection.blocks;
    }

    if (paragraph.bullet) {
      appendListItem(currentTarget, paragraph.bullet.listId, paragraphHtml);
      return;
    }

    if (paragraphHtml) {
      appendParagraph(currentTarget, paragraphHtml);
    }
  });

  sections.forEach(function (section) {
    flushList(section.blocks);
    section.subsections.forEach(function (sub) {
      flushList(sub.blocks);
    });
  });

  return sections;
}

async function fetchInlineImages(inlineObjects, auth) {
  var images = {};
  var objectIds = Object.keys(inlineObjects || {});
  if (!objectIds.length) {
    return images;
  }
  await Promise.all(objectIds.map(async function (id) {
    var object = inlineObjects[id];
    if (!object || !object.inlineObjectProperties || !object.inlineObjectProperties.embeddedObject) {
      return;
    }
    var embedded = object.inlineObjectProperties.embeddedObject;
    if (!embedded.imageProperties || !embedded.imageProperties.contentUri) {
      return;
    }
    try {
      var response = await auth.request({
        url: embedded.imageProperties.contentUri,
        responseType: 'arraybuffer'
      });
      var buffer = Buffer.from(response.data);
      var contentType = (response.headers && (response.headers['content-type'] || response.headers['Content-Type'])) || 'image/png';
      images[id] = {
        dataUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
        alt: embedded.description || ''
      };
    } catch (err) {
      console.warn('Unable to fetch inline image', id, err.message);
    }
  }));
  return images;
}

module.exports = async (req, res) => {
  try {
    const auth = await getAuth();
    const docId = req.query.docId || DEFAULT_DOC_ID;
    if (!docId) {
      throw new Error('No document ID provided.');
    }

    const docsClient = google.docs({ version: 'v1', auth });
    const docResponse = await docsClient.documents.get({
      documentId: docId
    });
    const doc = docResponse.data;

    const inlineImages = await fetchInlineImages(doc.inlineObjects || {}, auth);
    const sections = buildSections(doc.body && doc.body.content, inlineImages);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    res.status(200).json({
      docId,
      sections
    });
  } catch (error) {
    console.error('Background API error:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      error: 'Unable to load background content',
      detail: error.message
    });
  }
};
