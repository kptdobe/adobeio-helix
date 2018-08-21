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

function removeChildren(children, n) {
  let ret = children;
  if (ret && ret.length > 0) {
    for(let i = 0; i < n; i++) {
      ret = ret.slice(1);
    }
  }
  return ret;
}

/**
 * The 'pre' function that is executed before the HTML is rendered
 * @param payload The current payload of processing pipeline
 * @param payload.resource The content resource
 */
function pre(payload) {

  payload.resource.children = removeChildren(payload.resource.children, 3);
  payload.resource.banner = {
    img: '',
    alt: ''
  };
  if (payload.resource.mdast.children.length > 1) {
    const heading = payload.resource.mdast.children[1];
    if (heading.children && heading.children.length > 0) {
        const img = heading.children[0];
        if (img.type === 'image') {
          payload.resource.banner.img = img.url;
          payload.resource.banner.text = img.alt;
        }
    }
  } 
}

module.exports.pre = pre;
