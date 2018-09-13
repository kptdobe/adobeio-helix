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
  validStates: ['hero', 'flow', 'gallery', 'textimage', 'imagetext', 'text'],
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
            break;
          }
        case 'hero':
        case 'flow':
        case 'textimage':
        case 'imagetext':
        case 'text':
          if (this.isTextImage(section)) {
            this.state = 'textimage';
          } else {
            if (this.isImageText(section)) {
              this.state = 'imagetext';
            } else {
              if (this.isText(section)) {
                this.state = 'text';
              } else {
                if (this.isGallery(section)) {
                  this.state = 'gallery';
                } else {
                  this.state = 'flow';
                }
              }
            }
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
    // If the section has one paragraph and one image, it's a hero
    const images = select(section, 'image');
    const paragraphs = select(section, 'paragraph');
    return (paragraphs.length == 1 && images.length == 1);
  },

  isTextImage(section) {
    // If the section start with a paragraph then an image, it's a text image
    return (section.children.length > 1 && section.children[0].type == 'paragraph' && section.children[1].type == 'image');
  },

  isImageText(section) {
    // If the section start with an image then a paragraph, it's a text image
    return (section.children.length > 1 && section.children[1].type == 'paragraph' && section.children[0].type == 'image');
  },

  isText(section) {
    // If the section contains only paragraph and optionally starts with a heading, it's a text
    const images = select(section, 'image');
    const paragraphs = select(section, 'paragraph');
    const headings = select(section, 'heading');
    return images.length == 0 && paragraphs.length > 0 && (headings.length == 0 || section.children[0].type == 'heading');
  },

  isGallery(section) {
    // If the section has more than 2 images, it is a gallery
    const images = select(section, 'image');
    const paragraphs = select(section, 'paragraph');
    return images.length > 2 && paragraphs.length == 0;
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

function computeSectionsHAST(sectionsMdast) {
  const nodes = [];
  let odd = false;
  sectionsMdast.forEach(function (section) {
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

function sectionWrapper(sections, type, tagName, wrapperTag, classes) {
  const sectionsFound = [];
  const sectionsHAST = [];

  sections.children.forEach(function(s) {
    sectionsHAST.push(s.hast);
    if (s.type == type) {
      sectionsFound.push(s);
    }
  });
  
  sectionsFound.forEach(function(s) {
    s.hast.children.forEach(function(node, index) {
      if (node.tagName == tagName) {
        console.log('found hast node', node);
        const rootNewNode = {};
        let currentNode = rootNewNode;
        classes.forEach(function(css, index) {
          currentNode.type = 'element';
          currentNode.tagName = wrapperTag;
          currentNode.properties = {
            className: css
          }
          currentNode.children = [];
          if (index < classes.length-1) {
            //link next node to parent
            const n = currentNode;
            currentNode = {};
            n.children.push(currentNode);
          }
        });
        currentNode.children = [];
        currentNode.children.push(node);
        console.log('new node to replace', rootNewNode);
        s.hast.children[index] = rootNewNode;
      }
    });
    s.html = toHTML(s.hast);
  });


  sections.html = toHTML({
    type: 'root',
    children: sectionsHAST
  });
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
  sectionWrapper(payload.content.sections, 'hero', 'p', 'div', ['hero_wrapper', 'hero_text', 'hero_title']);
  sectionWrapper(payload.content.sections, 'hero', 'img', 'div', ['hero_img']);
  
  // avoid htl execution error if missing
  payload.content.meta = payload.content.meta || {};
  payload.content.meta.references = payload.content.meta.references || [];
  payload.content.meta.icon = payload.content.meta.icon || '';
}

module.exports.pre = pre;
