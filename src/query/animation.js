﻿define([
  './addListener',
  './getClassIndex',
  './setClass',
  './ElementsData'
], function (addListener, getClassIndex, setClass, ElementsData) {
  var animation = {
    insert: function (parentElement, index, chunk) {
      index = getIndexOffset(parentElement, index);
      var insertPositionNode = parentElement.childNodes[index];
      var childNodesCount;
      var firstChild;

      blocks.each(chunk, function (node) {
        childNodesCount = node.nodeType == 11 ? node.childNodes.length : 0;
        firstChild = node.childNodes ? node.childNodes[0] : undefined;

        if (insertPositionNode) {
          //checkItemExistance(insertPositionNode);
          parentElement.insertBefore(node, insertPositionNode);
        } else {
          //checkItemExistance(parentElement.childNodes[parentElement.childNodes.length - 1]);
          parentElement.appendChild(node);
        }

        if (childNodesCount) {
          while (childNodesCount) {
            animateDomAction('add', firstChild);
            firstChild = firstChild.nextSibling;
            childNodesCount--;
          }
        } else {
          animateDomAction('add', node);
        }
      });
    },

    remove: function (parentElement, index, count) {
      var i = 0;
      var node;

      index = getIndexOffset(parentElement, index);

      for (; i < count; i++) {
        node = parentElement.childNodes[index];
        if (node) {
          if (animateDomAction('remove', node)) {
            index++;
          }
        }
      }
    },

    setVisibility: function (element, visible) {
      if (visible) {
        animation.show(element);
      } else {
        animation.hide(element);
      }
    },

    show: function (element) {
      animateDomAction('show', element);
    },

    hide: function (element) {
      animateDomAction('hide', element);
    }
  };

  function getIndexOffset(parentElement, index) {
    var elementData = ElementsData.data(parentElement);
    if (elementData && elementData.animating > 0) {
      var childNodes = parentElement.childNodes;
      var childIndex = 0;
      var currentIndex = 0;
      var className;

      while (index != currentIndex) {
        if (!childNodes[childIndex]) {
          return Number.POSITIVE_INFINITY;
        }
        className = childNodes[childIndex].className;
        childIndex++;

        if (getClassIndex(className, 'b-hide') == -1) {
          currentIndex++;
        }
      }

      if (!childNodes[childIndex]) {
        return Number.POSITIVE_INFINITY;
      }

      className = childNodes[childIndex].className;

      while (getClassIndex(className, 'b-hide') != -1) {
        childIndex++;
        if (!childNodes[childIndex]) {
          return Number.POSITIVE_INFINITY;
        }
        className = childNodes[childIndex].className;
      }

      return childIndex;
    }

    return index;
  }

  function animateDomAction(type, element) {
    var animating = false;
    var elementData = ElementsData.createIfNotExists(element);
    var parentElementData = ElementsData.createIfNotExists(element.parentNode);
    var animateCallback = elementData.animateCallback;
    var cssType = type == 'remove' ? 'hide' : type == 'add' ? 'show' : type;
    var disposeCallback = type == 'remove' ? function disposeElement() {
      ElementsData.clear(element, true);
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    } : type == 'hide' ? function hideElement() {
      element.style.display = 'none';
    } : blocks.noop;
    var readyCallback = function () {
      elementData.animating -= 1;
      parentElementData.animating -= 1;
      if (!elementData.animating) {
        disposeCallback();
      }
    };

    if (element.nodeType != 1) {
      disposeCallback();
      return;
    }

    if (type == 'show') {
      element.style.display = '';
    }

    if (elementData.preprocess) {
      disposeCallback();
      return;
    }

    if (animateCallback) {
      animating = true;
      elementData.animating += 1;
      parentElementData.animating += 1;
      var context = blocks.context(element);
      var thisArg = context.$view || context.$root;
      animateCallback.call(thisArg, element, readyCallback, cssType);
    }
    return animating || cssAnimate(cssType, element, disposeCallback, readyCallback);
  }

  function cssAnimate(type, element, disposeCallback, readyCallback) {
    if (typeof window == 'undefined' || window.ontransitionend === undefined) {
      disposeCallback();
      return;
    }
    setClass('add', element, 'b-' + type);

    var computedStyle = window.getComputedStyle(element);
    var prefix = '';
    var eventName;
    if (window.onanimationend === undefined && window.onwebkitanimationend !== undefined) {
      prefix = '-webkit-';
      eventName = 'webkitAnimationEnd';
    } else {
      eventName = 'animationend';
    }

    var transitionDuration = parseFloat(computedStyle['transition-duration']) || 0;
    var transitionDelay = parseFloat(computedStyle['transition-delay']) || 0;
    var animationDuration = parseFloat(computedStyle[prefix + 'animation-duration']) || 0;
    var animationDelay = parseFloat(computedStyle[prefix + 'animation-delay']) || 0;

    if ((transitionDuration <= 0 && transitionDelay <= 0 &&
      animationDuration <= 0 && animationDelay <= 0) ||
      !willAnimate(element, type)) {

      setClass('remove', element, 'b-' + type);
      disposeCallback();
      return;
    }

    ElementsData.createIfNotExists(element).animating += 1;
    ElementsData.createIfNotExists(element.parentNode).animating += 1;

    setTimeout(function () {
      setClass('add', element, 'b-' + type + '-end');
      element.addEventListener('transitionend', end, false);
      element.addEventListener(eventName, end, false);
    }, 1);

    function end() {
      setClass('remove', element, 'b-' + type);
      setClass('remove', element, 'b-' + type + '-end');
      readyCallback();
      element.removeEventListener('transitionend', end, false);
      element.removeEventListener(eventName, end, false);
    }

    return true;
  }


  // cache the willAnimate results
  // each element with identical className, style attribute and tagName
  // can be cached because the result will always be the same
  var willAnimateCache = {};

  // determines if the element will be transitioned or animated
  // check if the transitionProperty changes after applying b-type and b-type-end classes
  // if it changes this means that the element have styles for animating the element
  function willAnimate(element, type) {
    // cache key is unique combination between className, style attribute and tagName
    // which ensures the element will have the same styles
    var fromCache = willAnimateCache[element.className + element.getAttribute('style') + element.tagName];
    var result = false;
    var transitionProperties;
    var startStyle;
    var endStyle;

    if (fromCache || fromCache === false) {
      return fromCache;
    }

    setClass('remove', element, 'b-' + type);

    startStyle = blocks.extend({}, window.getComputedStyle(element));

    setClass('add', element, 'b-' + type);
    setClass('add', element, 'b-' + type + '-end');

    endStyle = window.getComputedStyle(element);

    // transitionProperty could return multiple properties - "color, opacity, font-size"
    transitionProperties = endStyle.transitionProperty.split(',');

    blocks.each(transitionProperties, function (property) {
      property = property.trim().replace(/-\w/g, function (match) {
        return match.charAt(1).toUpperCase();
      });

      if (property == 'all') {
        for (var key in endStyle) {
          if (endStyle[key] != startStyle[key]) {
            result = true;
          }
        }
        return false;
      } else {
        if (endStyle[property] != startStyle[property]) {
          result = true;
          return false;
        }
      }
    });

    setClass('remove', element, 'b-' + type + '-end');

    willAnimateCache[element.className + element.getAttribute('style') + element.tagName] = result;

    return result;
  }

  return animation;
});
