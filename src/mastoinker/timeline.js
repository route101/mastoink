
(function () { 'use strict';	


function TimelineItem(node) {
  this.node = node; // preserve reference
  this.id = null;
  this.name = null;
  this.displayNameHTML = null;
  this.displayNameText = null;
  this.imageAnchors = null;
  this.hasMediaSpoiler = null;
  this.datetime = null;
  this.boostButton = null;
  this.favouriteButton = null;
  this.boosted = false;
  this.onHomeColumn = false;
  this.onUserColumn = false;
  this.link = null;
  this.numid = null;
  this.videoContainer = null;
  this.author = null;
  this.authorURL = null;
}

TimelineItem.prototype.downloadImages = function () {
  var counter = 0;
  var items = [];
  var dir = window.location.host;
  if (dir == null || dir == '') return;
  dir = 'oinker_' + dir;
  
  for (var anchor of this.imageAnchors) {
    counter += 1;
    var imageUri = anchor.href;
    var ext = anchor.pathname.split('.').pop();
    var name = this.author;
    if (ext === 'php') {
      ext = 'png'; // HAX
    }
    var item = {url: imageUri, 
      filename: dir + '/' + 'i' + this.numid + '_n' + counter + '_' + name + '.' + ext};
    items.push(item);
  }
  var message = {
    type: 'download',
    data: {
      items: items
    }
  };
  chrome.runtime.sendMessage(message);
};

function TimelineObserver(element, context) {
  this.element = element;
  this.context = context;
  this.observer = null;
  this.sink = null;
  this.removedSink = null;
}

TimelineObserver.prototype.start = function () {
  var instance = this;
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type !== 'childList') return;
      var nodes = mutation.addedNodes;
      nodes.forEach(function (item) {
        if (!item) return;
        instance.handle(item);
      });

      var nodes = mutation.removedNodes;
      nodes.forEach(function (item) {
        if (!item) return;
        instance.handleRemoval(item);
      });
    });
  });
  var config = { attributes: true, childList: true, characterData: true, subtree: true };
  observer.observe(this.element, config);
  this.observer = observer;
};

TimelineObserver.prototype.stop = function () {
  if (this.observer === null) return;
  this.observer.stop();
  this.observer = null;
};

TimelineObserver.prototype.handle = function (node) {
  if (node.classList && node.classList.contains('status')) {
    this.handleStatus(node);
  }
  else if (node.children) {
    for (var child of node.children) {
      /* search boosted status recursively */
      this.handle(child);
    }
  }
};

TimelineObserver.prototype.handleStatus = function (node) {
  var name = ""
  var displayNameHTML = ""
  var displayNameText = ""
  var nameElem = node.querySelector('.status__display-name');
  if (nameElem) {
    name = nameElem.pathname.substring(1); /* trim `/` */
  }
  var displayNameElem = node.querySelector('.display-name');
  if (displayNameElem) {
    displayNameHTML = displayNameElem.innerHTML;
    displayNameText = displayNameElem.innerText;
  }
  var mediaSpoiler = node.querySelector('.media-spoiler');
  // filter click and listing
  if (mediaSpoiler && !this.context.getConfig('nsfw', true)) return;

  if (mediaSpoiler) {
    mediaSpoiler.click();
  }

  var datetime = null;
  var timeElem = node.querySelector('time');
  if (timeElem) {
    var datetimeStr = timeElem.getAttribute('datetime');
    if (datetimeStr && datetimeStr != "") {
      datetime = Date.parse(datetimeStr);
    }
  }

  var imageAnchors = node.querySelectorAll('a.media-gallery__item-thumbnail');

  /* comment out until the performance issue gets solved
  var videoContainer = null;
  var videoElem = node.querySelector('video');
  if (videoElem) {
    for (var elem of node.children) {
      if (!elem.contains(videoElem)) {
        continue;
      }
      videoContainer = elem;
      videoContainer = videoContainer.cloneNode(true);
      break;
    }
  }
  */
  
  function findBoostButton(node) {
    var icon = node.querySelector('button.icon-button > i.fa.fa-fw.fa-retweet');
    if (icon == null) return null;
    return icon.parentNode;
  }

  function findFavButton(node) {
    var icon = node.querySelector('button.icon-button > i.fa.fa-fw.fa-star');
    if (icon == null) return null;
    return icon.parentNode;
  }
  
  var boostButton = findBoostButton(node);
  var favouriteButton = findFavButton(node);

  var statusLink = node.querySelector('a.status__relative-time');
  if (statusLink == null) statusLink = node.querySelector('a.status__time'); // for pawoo.net
  var pathname = statusLink.pathname;
  var pathnameComponents = pathname.split('/');
  if (pathnameComponents.length < 3) return;
  
  function findAuthorID() {
    var fst = pathnameComponents[1];
    if (fst.substring(0, 1) === '@') {
      return fst.substring(1);
    }
    else if (fst === 'users') {
      return pathnameComponents[2];
    }
    return "";
  }
  
  var author = findAuthorID();

  var item = new TimelineItem(node);
  item.name = name;
  item.author = author;
  item.displayNameHTML = displayNameHTML;
  item.displayNameText = displayNameText;
  item.imageAnchors = imageAnchors;
  item.hasMediaSpoiler = mediaSpoiler != null;
  item.datetime = datetime;
  item.boostButton = boostButton;
  item.favouriteButton = favouriteButton;
  item.id = pathname;
  item.numid = pathname.substr(pathname.lastIndexOf('/') + 1);
  item.link = statusLink.href;
  item.authorURL = new URL("/@" + author, statusLink.href);
  
  /* item.videoContainer = videoContainer; */

  if (node.previousSibling) {
    var sibling = node.previousSibling;
    var boosted = sibling.classList.contains('status__prepend');
    item.boosted = boosted;
  }

  function searchColumnThatContainsNode(node) {
    var node = node.parentNode;
    var body = document.body;
    while (node != null) {
      if (node === body) return null;
      if (node.classList && node.classList.contains('column')) return node;
      node = node.parentNode;
    }
    return null;
  }
  
  function isHomeColumn(column) {
    var homeIcon = column.querySelector('.column-header > i.fa.fa-fw.fa-home');
    return (homeIcon != null);
  }
  
  function isUserColumn(column) {
    var header = column.querySelector('.scrollable > div > div > .account__header');
    return (header != null);
  }
  
  var column = searchColumnThatContainsNode(node);
  if (column) {
    item.onHomeColumn = isHomeColumn(column);
    item.onUserColumn = isUserColumn(column);
  }
  
  // filtering
  if (!this.context.getConfig('listboost', true) && item.boosted) return;
  if (!this.context.getConfig('listhome', true) && item.onHomeColumn) return;
  if (!this.context.getConfig('listuser', true) && item.onUserColumn) return;

  if (this.sink !== null) {
    this.sink(item);
  }
};


TimelineObserver.prototype.handleRemoval = function (node) {
  if (node.classList && node.classList.contains('status')) {
    this.handleStatusRemoval(node);
  }
  else if (node.children) {
    for (var child of node.children) {
      /* search boosted status recursively */
      this.handleRemoval(child);
    }
  }
};

TimelineObserver.prototype.handleStatusRemoval = function (node) {
  var statusLink = node.querySelector('a.status__relative-time');
  if (statusLink == null) statusLink = node.querySelector('a.status__time'); // for pawoo.net
  if (statusLink == null) return;

  var id = statusLink.pathname;
  if (this.removedSink !== null) {
    this.removedSink(id);
  }
};


this.TimelineObserver = TimelineObserver;

}).call(this);
