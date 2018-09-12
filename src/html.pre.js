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
const visit  = require('unist-util-visit');
const toHAST = require('mdast-util-to-hast');
const toHTML = require('hast-util-to-html');


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
  validStates: ['hero', 'flow'],
  states: ['init'],
  get state(){
    return this.states[this.states.length - 1];
  },
  set state(v){
    console.log(`${this.state} -> ${v}`);

    this.states.push(v);
    return v;
  },
  layout: function(section){
    // allow manual overide of class
    // this might be instant-cruft–discuss.
    if (section.class && section.class.length) {
      // If class is a valid state, use it, otherwise default to 'flow'
      if (this.validStates.includes(section.class)){
        this.states.push(section.class);
      }
      else{
        this.states.push('flow');
      }
    }
    else{
      switch(this.state){
        case 'init':
          // If the section has an h2 & an image, it's a hero
          let image = select(section, 'image');
          let h = select(section, 'heading');
          if (h.length == 1 && h[0].depth == 2 && image.length == 1){
            h = h[0];
            this.state = 'hero';
            section.children = [h];
            section.type = 'standard';
            section.style = `background-image: url("#{image});`;

            break;
          }
          else{
            this.state = 'flow';
            break;
          }
        case 'hero':
          this.state = 'flow';
          break;
      }
      section.class = this.state;
    }

    let children = [];
    for (let e of section.children){
      children.push(toHTML(toHAST(e)));
    }
    section.children = children;
    return section;
  },
  get hasHero(){
    return this.states.includes('hero');
  }
}

/**
 * The 'pre' function that is executed before the HTML is rendered
 * @param payload The current payload of processing pipeline
 * @param payload.resource The content resource
 */
function pre(payload) {

  let title = null;

  // banner is first image and banner text is image alt
  payload.resource.banner = {
    img: '',
    text: ''
  };
  const firstImg = select(payload.resource.mdast, 'image');
  if (firstImg.length > 0) {
    payload.resource.banner = {
      img: firstImg[0].url,
      text: firstImg[0].alt
    }
  }

  const content = [];
  let currentSection = {children: [], type: 'standard'};

  visit(payload.resource.mdast, ["paragraph","heading","thematicBreak"], function (node) {

    if (node.type == "heading" && node.depth == 1 && !title){
      title = node.children[0].value;
      return;
    }
    if (node.type == "thematicBreak") {
      content.push(LayoutMachine.layout(currentSection));
      currentSection = {children: [], type: 'standard'};
    }
    else {
      currentSection.children.push(node);
    }
  });

  content.push(LayoutMachine.layout(currentSection));

  payload.resource.content = content;

  // avoid htl execution error if missing
  payload.resource.meta = payload.resource.meta || {};
  payload.resource.meta.references = payload.resource.meta.references || [];
  payload.resource.meta.icon = payload.resource.meta.icon || '';
}

module.exports.pre = pre;
