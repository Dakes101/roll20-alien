// alien-npc-importer.js
// Roll20 API script to create Alien RPG NPCs from Markdown handouts
// Command: !alien-npc-from-md --handout "Handout Name"

var AlienNPCImporter = AlienNPCImporter || (function () {
  'use strict';

  // ------------------------------------------------------------
  // CONFIG
  // ------------------------------------------------------------

  // Human-readable labels in .md → sheet attribute names
  var ATTR_MAP = {
    'Strength': 'strength',
    'Agility': 'agility',
    'Wits': 'wits',
    'Empathy': 'empathy',
    'Health': 'health',
    'Stress': 'stress',
    'Armor Rating': 'armor_rating',
    'Radiation': 'radiation',
    'Experience Points': 'xp'
  };

  // Human-readable skill labels in .md → sheet attribute names
  var SKILL_MAP = {
    'Heavy Machinery': 'heavy_machinery',
    'Close Combat': 'close_combat',
    'Stamina': 'stamina',
    'Ranged Combat': 'ranged_combat',
    'Mobility': 'mobility',
    'Piloting': 'piloting',
    'Observation': 'observation',
    'Comtech': 'comtech',
    'Survival': 'survival',
    'Command': 'command',
    'Manipulation': 'manipulation',
    'Medical Aid': 'medical_aid'
  };

  // Section headers used in the .md files
  var SECTION_HEADERS = ['ATTRIBUTES', 'SKILLS', 'GEAR', 'TALENTS', 'NOTES'];

  // ------------------------------------------------------------
  // UTILITIES
  // ------------------------------------------------------------

  /**
   * Convert Roll20 HTML content into plain text.
   * Handout notes and gmnotes are stored as HTML.
   */
  var htmlToText = function (html) {
    if (!html) { return ''; }

    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  };

  /**
   * Safely trim quotes around a string value: "value" → value
   */
  var trimQuotes = function (str) {
    if (!str) { return str; }
    str = str.trim();
    if ((str.charAt(0) === '"' && str.charAt(str.length - 1) === '"') ||
        (str.charAt(0) === '\'' && str.charAt(str.length - 1) === '\'')) {
      return str.substring(1, str.length - 1);
    }
    return str;
  };

  // ------------------------------------------------------------
  // PARSER: Markdown → NPC structure
  // ------------------------------------------------------------

  /**
   * Parse a Markdown NPC definition into a JS object.
   *
   * Expected format:
   * ---
   * name: "Melody Kim"
   * role: "Engineer"
   * tags: ["Typhon", "Ross 619"]
   * ---
   *
   * ATTRIBUTES
   * Strength: 3
   * ...
   *
   * SKILLS
   * Observation: 2
   * ...
   *
   * GEAR
   * - Item 1
   * ...
   *
   * TALENTS
   * - Talent 1
   *
   * NOTES
   * Free text...
   */
  var parseMarkdownNPC = function (md) {
    var result = {
      meta: {},
      attributes: {},
      skills: {},
      gear: [],
      talents: [],
      notes: ''
    };

    if (!md) { return result; }

    var text = md.replace(/\r\n/g, '\n');
    var body = text;
    var frontmatterEndIndex;
    var frontmatter;

    // Parse YAML-style frontmatter between --- lines
    if (text.indexOf('---') === 0) {
      frontmatterEndIndex = text.indexOf('\n---', 3);
      if (frontmatterEndIndex !== -1) {
        frontmatter = text.substring(3, frontmatterEndIndex).trim();
        body = text.substring(frontmatterEndIndex + 4).trim();

        var frontLines = frontmatter.split('\n');
        frontLines.forEach(function (line) {
          var m = line.match(/^(\w+):\s*(.+)$/);
          var key, val, inner;
          if (m) {
            key = (m[1] || '').toLowerCase();
            val = (m[2] || '').trim();

            if (key === 'tags') {
              // tags: ["Tag1", "Tag2"]
              inner = val.replace(/^\[|\]$/g, '');
              if (inner) {
                result.meta.tags = inner.split(',').map(function (s) {
                  return trimQuotes(s).trim();
                });
              } else {
                result.meta.tags = [];
              }
            } else {
              result.meta[key] = trimQuotes(val);
            }
          }
        });
      }
    }

    // Parse body sections
    var currentSection = null;
    body.split('\n').forEach(function (rawLine) {
      var line = rawLine.trim();
      var upper;

      if (!line) { return; }

      upper = line.toUpperCase();
      if (SECTION_HEADERS.indexOf(upper) !== -1) {
        currentSection = upper;
        return;
      }

      switch (currentSection) {
        case 'ATTRIBUTES': {
          var ma = line.match(/^([^:]+):\s*(.+)$/);
          var aKey, aVal;
          if (ma) {
            aKey = ma[1].trim();
            aVal = parseInt(ma[2].trim(), 10);
            if (!isNaN(aVal)) {
              result.attributes[aKey] = aVal;
            }
          }
          break;
        }

        case 'SKILLS': {
          var ms = line.match(/^([^:]+):\s*(.+)$/);
          var sKey, sVal;
          if (ms) {
            sKey = ms[1].trim();
            sVal = parseInt(ms[2].trim(), 10);
            if (!isNaN(sVal)) {
              result.skills[sKey] = sVal;
            }
          }
          break;
        }

        case 'GEAR': {
          var mg = line.match(/^-\s*(.+)$/);
          if (mg) {
            result.gear.push(mg[1].trim());
          } else {
            result.gear.push(line);
          }
          break;
        }

        case 'TALENTS': {
          var mt = line.match(/^-\s*(.+)$/);
          if (mt) {
            result.talents.push(mt[1].trim());
          } else {
            result.talents.push(line);
          }
          break;
        }

        case 'NOTES': {
          if (result.notes) {
            result.notes += '\n';
          }
          result.notes += line;
          break;
        }

        default:
          // Lines before any SECTION header are ignored for now
          break;
      }
    });

    return result;
  };

  // ------------------------------------------------------------
  // CHARACTER ATTRIBUTE HELPERS
  // ------------------------------------------------------------

  var createOrUpdateAttr = function (charId, name, value) {
    if (name === null || name === undefined || name === '') {
      return;
    }

    var attrs = findObjs({
      _type: 'attribute',
      _characterid: charId,
      name: name
    });

    if (attrs && attrs.length) {
      attrs[0].set('current', value);
    } else {
      createObj('attribute', {
        name: name,
        current: value,
        characterid: charId
      });
    }
  };

  // ------------------------------------------------------------
  // MAIN: Create Alien NPC from parsed data
  // ------------------------------------------------------------

  var createAlienNPC = function (npcData) {
    var name = npcData.meta.name || 'ALIEN NPC';
    var role = npcData.meta.role || '';
    var tags = npcData.meta.tags || [];
    var sheet = npcData.meta.sheet || 'Alien Roleplaying Game';

    var char = createObj('character', {
      name: name,
      inplayerjournals: '',
      controlledby: ''
    });

    // Basic attributes
    Object.keys(npcData.attributes).forEach(function (label) {
      var sheetName = ATTR_MAP[label] ||
        label.toLowerCase().replace(/\s+/g, '_');
      createOrUpdateAttr(char.id, sheetName, npcData.attributes[label]);
    });

    // Skills
    Object.keys(npcData.skills).forEach(function (label) {
      var sheetName = SKILL_MAP[label] ||
        label.toLowerCase().replace(/\s+/g, '_');
      createOrUpdateAttr(char.id, sheetName, npcData.skills[label]);
    });

    // Bio text: role, tags, gear, talents, notes
    var bioLines = [];

    bioLines.push('Sheet: ' + sheet);

    if (role) {
      bioLines.push('Role: ' + role);
    }
    if (tags.length) {
      bioLines.push('Tags: ' + tags.join(', '));
    }

    if (npcData.gear && npcData.gear.length) {
      bioLines.push('');
      bioLines.push('Gear:');
      npcData.gear.forEach(function (g) {
        bioLines.push('- ' + g);
      });
    }

    if (npcData.talents && npcData.talents.length) {
      bioLines.push('');
      bioLines.push('Talents:');
      npcData.talents.forEach(function (t) {
        bioLines.push('- ' + t);
      });
    }

    if (npcData.notes) {
      bioLines.push('');
      bioLines.push(npcData.notes);
    }

    char.set('bio', bioLines.join('\n'));

    return char;
  };

  // ------------------------------------------------------------
  // CHAT HANDLER
  // ------------------------------------------------------------

  /**
   * Command format:
   * !alien-npc-from-md --handout "Handout Name"
   */
  var handleInput = function (msg) {
    if (msg.type !== 'api') { return; }

    var content = msg.content || '';
    if (content.indexOf('!alien-npc-from-md') !== 0) { return; }

    var args = content.split(/\s+--/).slice(1);
    var handoutName = null;

    args.forEach(function (arg) {
      var parts = arg.trim().split(/\s+/);
      var key = parts.shift();
      var value = parts.join(' ').trim();

      if (key === 'handout') {
        // Strip optional quotes
        handoutName = trimQuotes(value);
      }
    });

    if (!handoutName) {
      sendChat('AlienNPC', '/w gm Usage: !alien-npc-from-md --handout "Handout Name"');
      return;
    }

    var handout = findObjs({
      _type: 'handout',
      name: handoutName
    })[0];

    if (!handout) {
      sendChat('AlienNPC', '/w gm No handout called "' + handoutName + '" found.');
      return;
    }

    // You can switch between "notes" and "gmnotes" here if you prefer GM-only
    handout.get('notes', function (notes) {
      var text = htmlToText(notes);
      var npcData = parseMarkdownNPC(text);
      var char = createAlienNPC(npcData);

      sendChat('AlienNPC', '/w gm Created NPC "' + char.get('name') +
        '" from handout "' + handoutName + '".');
    });
  };

  var registerEventHandlers = function () {
    on('chat:message', handleInput);
  };

  // Public API
  return {
    RegisterEventHandlers: registerEventHandlers
  };
}());

on('ready', function () {
  'use strict';
  AlienNPCImporter.RegisterEventHandlers();
  log('Alien NPC Importer ready: !alien-npc-from-md --handout "Name"');
});
