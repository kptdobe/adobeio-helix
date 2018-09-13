/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
const select = require('unist-util-select');
const hastSelect = require('hast-util-select').select
const toHAST = require('mdast-util-to-hast');
const toHTML = require('hast-util-to-html');
const mdastSqueezeParagraphs = require('mdast-squeeze-paragraphs');
const mdastFlattenImages = require('mdast-flatten-image-paragraphs');
const mdastFlattenLists = require('mdast-flatten-listitem-paragraphs');


/**
 * The LayoutMachine is an implmentation of a state machine pattern
 * that tries to intelligently lay out the page.
 */
const LayoutMachine = {
  /*
    States:
      init -> hero, flow
      hero -> flow
  */
  validStates: ['hero', 'flow', 'gallery'],
  states: ['init'],
  get state() {
    return this.states[this.states.length - 1];
  },
  set state(v) {
    this.states.push(v);
    return v;
  },
  layout: function (section) {
    // allow manual overide of class
    // this might be instant-cruft–discuss.
    if (section.class && section.class.length) {
      // If class is a valid state, use it, otherwise default to 'flow'
      if (this.validStates.includes(section.class)) {
        this.states.push(section.class);
      } else {
        this.states.push('flow');
      }
    } else {
      switch (this.state) {
        case 'init':
          if (this.isHero(section)) {
            this.state = 'hero';
          } else {
            if (this.isGallery(section)) {
              this.state = 'gallery';
            } else {
              this.state = 'flow';
            }
          }
          break;
        case 'flow':
        case 'hero':
          if (this.isGallery(section)) {
            this.state = 'gallery';
          } else {
            this.state = 'flow';
          }
          break;
      }
      section.class = this.state;
    }

    let children = [];
    for (let e of section.children) {
      children.push(e);
    }
    section.children = children;
    return section;
  },

  get hasHero() {
    return this.states.includes('hero');
  },

  isHero(section) {
    // If the section has an h2 & an image in the first level, it's a hero
    const image = select(section, 'image');
    const p = select(section, 'paragraph');
    return (p.length == 1 && image.length == 1);
  },

  isGallery(section) {
    // If the section has more than 2 images, it is a gallery
    const image = select(section, 'image');
    return image.length > 2
  },
}

function getSmartDesign(mdast, breakSection) {
  breakSection = breakSection ? breakSection : function (node) {
    return node.type == 'thematicBreak';
  };

  mdast = mdastFlattenImages()(mdast);
  mdast = mdastFlattenLists()(mdast);
  mdast = mdastSqueezeParagraphs(mdast);

  const mdastNodes = mdast.children;

  const sections = [];
  let currentSection = {
    children: [],
    type: 'standard'
  };

  let title;

  mdastNodes.forEach(function (node) {
    if (node.type == 'heading' && node.depth == 1 && !title) {
      title = node.children[0].value;
      return;
    }
    const br = breakSection(node);
    if (br.break) {
      sections.push(LayoutMachine.layout(currentSection));
      currentSection = {
        children: [],
        type: 'standard'
      };
      if (br.include) {
        currentSection.children.push(node);
      }
    } else {
      currentSection.children.push(node);
    }
  });

  sections.push(LayoutMachine.layout(currentSection));
  return sections;
}

function computeSectionsHAST(sections) {
  const nodes = [];
  let odd = false;
  sections.forEach(function (section) {
    const hast = toHAST(section);
    const htmlNodes = [];
    hast.children.forEach(function (h) {
      htmlNodes.push(toHTML(h));
    });
    nodes.push({
      type: "element",
      properties: {
        className: section.class + ' ' + ((odd = !odd) ? 'odd' : 'even'),
      },
      tagName: 'section',
      children: hast.children,
      data: {
        type: section.class
      }
    });
  });
  return nodes;
}

function sectionsPipeline(payload, breakSection) {
  // get the sections MDAST
  const sectionsMdast = getSmartDesign(payload.content.mdast, breakSection);

  // get the sections MDAST
  const sectionsHAST = computeSectionsHAST(sectionsMdast);

  // create a "convienence object" that gives access to individual mdast, hast and html for each section.
  const sectionsDetails = [];

  sectionsMdast.forEach(function (mdast, index) {
    const hast = sectionsHAST[index];
    sectionsDetails.push({
      mdast: mdast,
      hast: hast,
      html: toHTML(hast),
      type: hast.data.type
    });
  });

  // convert full HAST to html
  const html = toHTML({
    type: 'root',
    children: sectionsHAST
  });

  return {
    html,
    children: sectionsDetails
  }
}

/**
 * The 'pre' function that is executed before the HTML is rendered
 * @param payload The current payload of processing pipeline
 * @param payload.content The content resource
 */
function pre(payload) {

  // banner is first image and banner text is image alt
  payload.content.banner = {
    img: '',
    text: ''
  };
  const firstImg = select(payload.content.mdast, 'image');
  if (firstImg.length > 0) {
    payload.content.banner = {
      img: firstImg[0].url,
      text: firstImg[0].alt
    }
  }

  const determineBreaks = function(mdast) {
    const isTB = mdast.type == 'thematicBreak'; // ---
    const isH2 = mdast.type == 'heading' && mdast.depth == 2;
    return {
      break: isTB || isH2,
      include: isH2
    }
  }
  payload.content.sections = sectionsPipeline(payload, determineBreaks);

  // EXTENSION point demo
  // -> I need a different DOM for the hero section
  if (payload.content.sections.children.length > 0 && payload.content.sections.children[0].type == 'hero') {
    const hero = payload.content.sections.children[0].hast;
    const img = hastSelect('img', hero);
    const p = hastSelect('p', hero);

    // create object to be consumed in HTML to render custom HTML for hero section
    payload.content.sections.hero = {
      sectionClass: hero.properties.className,
      img: toHTML(img),
      p: toHTML(p)
    };
  }

  // avoid htl execution error if missing
  payload.content.meta = payload.content.meta || {};
  payload.content.meta.references = payload.content.meta.references || [];
  payload.content.meta.icon = payload.content.meta.icon || '';
}

module.exports.pre = pre;
