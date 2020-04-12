import ko from 'knockout'
import format from 'date-fns/format'
import axios from 'axios'
import store from 'store'
import uuidv4 from 'uuid/v4'
import botTemplate from '../templates/bot.html'
import './trendingCard.js'
import './topicList.js'
import './itemList.js'
import './answer.js'
import './attachment.js'
import config from '../config.js'
import VConsole from 'vconsole'
import display from '../message.js'
if (window.location.search.indexOf('debug=true') >= 0) {
  window.vConsole = new VConsole();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function scrollDown() {
  // window.scrollTo({
  //   top: document.getElementById('content').scrollHeight,
  //   smooth: true
  // })
  window.scroll(0, document.getElementById('content').scrollHeight);
}

function syncScrollDown() {
  setTimeout(scrollDown, 10)
}

async function deferedScrollDown() {
  await sleep(10)
  scrollDown()
}

function debug(msg) {
  console.log(msg);
};

class BotViewModel {
  constructor() {
    const self = this
    self.display=display
    const now = new Date()
    const hello = ((now) => {
      const currentHour = now.getHours()
      if (currentHour >= 3 && currentHour < 8) {
        return display.js_message.item_4
      } else if (currentHour >= 8 && currentHour < 11) {
        return display.js_message.item_4
      } else if (currentHour >= 11 && currentHour < 13) {
        return display.js_message.item_5
      } else if (currentHour >= 13 && currentHour < 18) {
        return display.js_message.item_5
      } else {
        return display.js_message.item_6
      }
    })(now)

    ko.bindingHandlers.placeholder = {
      init: function (element, valueAccessor, allBindingsAccessor) {
        var underlyingObservable = valueAccessor();
        ko.applyBindingsToNode(element, { attr: { placeholder: underlyingObservable } });
      }
    };

    self.placeholderText = ko.observable(display.js_message.item_7);
    self.removeAskFeedback = config.removeAskFeedback;
    self.hideHotQuestions = config.hideHotQuestions;
    self.loading = ko.observable(false)
    self.blocked = ko.observable(false)
    self.askedTimes = ko.observable(0)
    self.errorTimes = ko.observable(0)
    self.forcedToShowTransferButton = ko.observable(false)
    self.showTransferButton = ko.computed(() => {
      try {
        return self.forcedToShowTransferButton() || self.askedTimes() >= parseInt(self.settings['switch_manual_times']) || self.errorTimes() > parseInt(self.settings['intent_fails_times'])
      } catch (_error) {
        return false
      }
    })
    self.operationStack = [];
    let loadConversationHistory = function () {
      let operationStackString = store.get("operationStack_" + config.botName);
      if (operationStackString) {
        self.operationStack = JSON.parse(operationStackString);
      }
      if (self.operationStack && self.operationStack.length > 0) {
        self.operationStack.forEach(function (op) {
          self.messageList.push(op);
        });
      }
    }

    self.showQueryCard = async function (_data, _event) {
      const queryMessage = {
        type: 'query-card',
        timestamp: format(now, 'HH:mm')
      }
      addToMessageList(queryMessage);
      await deferedScrollDown()
    }

    self.question = ko.observable('')
    self.onEnterKey = (_data, event) => {
      if (event.keyCode === 13 && self.question()) {
        self.sendQuestion().then(function () {
          // the only way we call an async function in sync codes
        })
        return false
      }
      return true
    }

    self.onInputBlur = () => {
      setTimeout(() => {
        window.scroll(0, document.getElementById('content').scrollHeight - 300);
      }, 30)
      return true;
    }

    self.onSubmit = async function (_data, _event) {
      if (!self.question()) {
        return
      }
      await self.sendQuestion()
    }

    self.blockUser = async function () {
      await axios.post(`${config.botGateway}/bot/blacklist`, {
        user_id: self.userId,
        user_agent: window.navigator.userAgent
      })
      self.blocked(true)
    }

    self.recordQuestion = async function (question) {
      self.askedTimes(self.askedTimes() + 1)
      await axios.post(`${config.botGateway}/bot/questions`, {
        user_id: self.userId,
        question: question
      })

      if (self.askedTimes() >= parseInt(self.settings['malicious_user_banned'])) {
        await self.blockUser()
        await self.youAreBlocked()
      }
    }

    self.sendQuestion = async function () {
      await self.appendQuestion(self.question())

      if (self.blocked()) {
        await self.youAreBlocked()
        self.question('')
        return
      }

      for (let keyword of self.settings['switch_manual'].split('/')) {
        if (self.question().includes(keyword.trim())) {
          self.forcedToShowTransferButton(true)

          const message = {
            type: 'text',
            timestamp: format(now, 'HH:mm'),
            body: display.js_bot.item_1
          }
          self.appendMessageNoWait(message)

          self.question('')
          return
        }
      }

      self.loading(true)

      while (!self.botInitialized()) {
        console.log("Waiting for connection & initialization be ready...");
        await sleep(1000);
      }

      self.sendMessage(self.question());
      console.log("*Question: ", self.question())
      await self.recordQuestion(self.question())

      self.question('')
    }

    self.messageList = ko.observableArray([])
    self.messages = ko.computed(() => {
      let timestampSet = new Set()
      let messages = self.messageList().map(message => {
        if (timestampSet.has(message.timestamp)) {
          message.showAvatar = false
        } else if (message.type !== 'question') {
          timestampSet.add(message.timestamp)
          message.showAvatar = true
        } else {
          message.showAvatar = false
        }
        return message
      })
      for (let i = 1; i < messages.length; i++) {
        const previousMessage = messages[i - 1]
        const currentMessage = messages[i]
        if (previousMessage.type === 'question' && currentMessage.type !== 'question') {
          currentMessage.showAvatar = true
        }
      }
      return messages
    })

    let addToMessageList = function (message) {
      self.messageList.push(message);
      self.operationStack.push(message);
      while (self.operationStack.length > config.max_history_records) {
        self.operationStack.shift();
      }
      store.set("operationStack_" + config.botName, JSON.stringify(self.operationStack));
    }

    self.appendQuestion = async function (question) {
      const message = {
        type: 'question',
        timestamp: format(new Date(), 'HH:mm'),
        body: question
      }
      addToMessageList(message);
      await deferedScrollDown()
    }

    self.appendMessage = async function (message) {
      self.loading(true)
      await sleep(300)
      self.loading(false)
      addToMessageList(message);
      await deferedScrollDown()
    }

    self.appendMessageNoWait = (message) => {
      addToMessageList(message);
      syncScrollDown()
    }

    self.loadTopics = async function (categoryId) {
      self.loading(true)
      scrollDown()
      const topicPromise = axios.get(`${config.botGateway}/bot/categories/${categoryId}/topics`)
      const [topicResponse] = await Promise.all([topicPromise, sleep(30)])
      self.loading(false)
      const message = {
        type: 'topic-list',
        timestamp: format(new Date(), 'HH:mm'),
        topics: topicResponse.data.payload
      }
      addToMessageList(message);
      await deferedScrollDown()
    }

    self.sayHello = async () => {
      self.sayHelloNoWait();
      await deferedScrollDown();
    }

    self.sayHelloNoWait = () => {
      addToMessageList({
        type: 'text',
        timestamp: format(now, 'HH:mm'),
        body: self.settings['hint']
      })
      if (!self.hideHotQuestions) {
        addToMessageList(self.trendingMessage);
      }
    }

    self.youAreBlocked = async function () {
      const message = {
        type: 'text',
        timestamp: format(now, 'HH:mm'),
        body: display.js_bot.item_2
      }
      addToMessageList(message);
      await deferedScrollDown()
    }

    self.botInitialized = ko.observable(false)
    self.wsParam = {
      "SO_SUFFIX": Math.ceil(Math.random() * 100000000),
      "MAX_RETRIES": 120,
      "retryTimes": 0,
      "SocketSessionExpire": 180,
      "LAST_ACTIVITY_TIME": Date.now() / 1000 | 0,
      "currentConnection": null,
      "ws": null,
      "isForceClosed": false,
      "initLck": false,
      "messageToBot": {
        "to": {
          "type": "bot",
          "id": config.botName
        }
      }
    }
    self.initWebSocket = async function () {
      if (self.wsParam["initLck"] === true) {
        console.log("Last connect is still in progress...");
        return;
      }

      debug("init websocket");
      self.wsParam["initLck"] = true;
      self.wsParam["currentConnection"] = config.wsServer + "?user="
        + self.userId + "&v=" + self.wsParam["SO_SUFFIX"];
      debug("Init ws: " + self.wsParam["currentConnection"]);
      try {
        let ws = new WebSocket(self.wsParam["currentConnection"]);
        self.wsParam["ws"] = ws;
      } catch (err) {
        self.wsParam["ws"] = null;
        self.wsParam["initLck"] = false;
        console.error(err.name + ":: " + err.message);
        alert("Failed to connect to the server. " + err.name
          + "::" + err.message + ", please try again!");
      }
      if (self.wsParam["ws"] === null) return;
      self.wsParam["isForceClosed"] = false;
      self.wsParam["ws"].onopen = function () {
        self.botInitialized(true);
        self.wsParam["initLck"] = false;
        self.placeholderText(display.js_bot.item_3);
      }
      self.wsParam["ws"].onmessage = function (evt) {
        if (!self.botInitialized()) {
          return
        }
        let resp = JSON.parse(evt.data);
        if (resp.error && resp.error.code === 103) {
          // Got hb resp, ignore.
          return;
        }
        let message = resp.body.messagePayload;
        console.log("Message received: ", message);
        if (message.type === 'text' && message.text === '_SORRY_') {
          if (self.errorTimes() === 0) {
            self.appendMessageNoWait({
              type: 'text',
              timestamp: format(new Date(), 'HH:mm'),
              body: display.js_bot.item_4
            })
          } else {
            self.appendMessageNoWait({
              type: 'text',
              timestamp: format(new Date(), 'HH:mm'),
              body: display.js_bot.item_5
            })
          }
          self.sayHelloNoWait()
          self.errorTimes(self.errorTimes() + 1)
        } else if (message.type === 'text') {
          let pair = message.text.split('\n\n\n')
          let answer = pair[pair.length - 1]
          let qnaMessage = {
            type: 'answer',
            timestamp: format(new Date(), 'HH:mm'),
            body: answer,
            actions: message.actions,
            globalActions: message.globalActions
          }
          self.appendMessageNoWait(qnaMessage)
        } else if (message.type === 'card') {
          let itemListMessage = {
            type: 'item-list',
            timestamp: format(new Date(), 'HH:mm'),
            items: message.cards,
            layout: message.layout,
            actions: message.actions,
            globalActions: message.globalActions
          }
          self.appendMessageNoWait(itemListMessage)
        } else if (message.type === 'attachment') {
          let attachmentMessage = {
            type: 'attachment',
            timestamp: format(new Date(), 'HH:mm'),
            data: message
          }
          self.appendMessageNoWait(attachmentMessage)
        } else {
          // unlikely
          console.error('The message type is unsupported: ' + message.type);
        }
        console.log("onmessage...[end]");
        self.loading(false);
        syncScrollDown()
      }
      self.wsParam["ws"].onclose = function () {
        debug("Connection is closed...");
        self.dispose(true);
      }
      self.wsParam["ws"].onerror = function (error) {
        debug("Websocket goes to ERROR", error);
        self.dispose();
      }
    }

    self.initWebSocketIfNeeded = async function () {
      debug("init websocketIF");
      let connection = config.wsServer + "?user=" + self.userId
        + "&v=" + self.wsParam["SO_SUFFIX"];
      if (connection !== self.wsParam["currentConnection"]) {
        await self.initWebSocket();
      }
    }

    self.sendMessage = async function (msgToSend, type) {
      var msgType = type || 'text';
      if (!msgToSend || /^\s*$/.test(msgToSend)) {
        console.warn("! Message to be sent is empty!");
        return;
      }
      if (msgType === 'text') {
        self.wsParam["messageToBot"].messagePayload = {
          type: "text",
          text: msgToSend
        };
      } else if (msgType === 'postback') {
        self.wsParam["messageToBot"].messagePayload = {
          type: "postback",
          postback: msgToSend
        };
      } else if (msgType === 'location') {
        self.wsParam["messageToBot"].messagePayload = {
          type: "location",
          location: msgToSend
        };
      } else {
        console.error("Message type not supported yet: " + msgType);
        return;
      }
      if (!msgToSend.t || msgToSend.t !== 'hb') {
        self.loading(true);
      } else {
        self.loading(false);
      }
      console.log("msgToSend", msgToSend);
      await self.sendToBot(self.wsParam["messageToBot"]);
    };

    // send message to the bot
    self.sendToBot = async function (message) {
      let jsonMsg = JSON.stringify(message);

      let timeSecs = Date.now() / 1000 | 0;
      if (timeSecs - self.wsParam["LAST_ACTIVITY_TIME"] >= self.wsParam["SocketSessionExpire"]) {
        console.log("Socket session expired: " + self.wsParam["currentConnection"]);
        self.dispose();
      }

      let success = false;
      do {
          success = await self.waitForSocketConnection(async () => {
              timeSecs = Date.now() / 1000 | 0;
              self.wsParam["LAST_ACTIVITY_TIME"] = timeSecs;
              self.wsParam["ws"].send(jsonMsg);
              // debug('Message sent: ' + JSON.stringify(message));
          });
          if(!success) {
              await sleep(1000);
          }
      } while(!success);
    }

    self.waitForSocketConnection = async function (callback) {
      if (self.wsParam["isForceClosed"] === true) {
        debug("Previous WebSocket down. Reconnecting...");
        while (self.wsParam["ws"] === null) {
            await self.initWebSocket();
            if (self.wsParam["ws"] === null) {
                await sleep(1000);
                console.warn("Connection cannot be established, retrying...");
            } else if(self.wsParam["ws"].readyState === 2 || self.wsParam["ws"].readyState === 3){
                debug("WebSocket is closing or closed.");
                // self.wsParam["ws"] = null;
                self.dispose();
            } else {
                debug("WebSocket is reconnecting or reconnected.")
            }
        }
      }

      let socket = self.wsParam["ws"];
      if(socket === null || typeof socket === 'undefined') {
          self.dispose(true);
          console.error("!!! This should never happend! Discard " +
              "sending the message to bot!");
          return false;
      }

      while (socket.readyState === 0) { // Connecting
          let socket2 = self.wsParam["ws"];
          if(socket !== socket2) {
            try{socket.close();}catch(err){}
            return false;
          }
          debug("Waiting for connection open: " + self.wsParam["currentConnection"]);
          await sleep(1000);
      }
      if (socket.readyState === 1) { // Connected
          self.wsParam["retryTimes"] = 0;
          if (callback) {
              callback();
          }
          return true;
      } else { // Closing or Closed
          self.wsParam["retryTimes"] = self.wsParam["retryTimes"] + 1;
          if (self.wsParam["retryTimes"] > self.wsParam["MAX_RETRIES"]) {
              console.error("!!! Connection error, websocket is closing or closed! " +
                  "Discard sending the message to bot!!",self.wsParam["currentConnection"]);
          } 
          return false;
      }
    }

    self.dispose = function (closed) {
      let directRemove = closed || false;
      if(directRemove) {
          self.wsParam["ws"] = null;
      } else {
          debug("Close socket...");
      }
      if (self.wsParam["ws"]) {
          try {
              self.wsParam["ws"].close();
          } catch (err) { }
          self.wsParam["ws"] = null;
      }
      self.loading(false);
      self.wsParam["isForceClosed"] = true;
      self.wsParam["retryTimes"] = 0;
      self.wsParam["SO_SUFFIX"] = Math.ceil(Math.random() * 100000000);
      self.botInitialized(false);
      self.wsParam["initLck"] = false;
    };

    self.initialize = async function () {
      if (store.get('userId')) {
        self.userId = store.get('userId')
      } else {
        self.userId = uuidv4()
        store.set('userId', self.userId)
      }

      self.loading(true)
      //const checkPromise = axios.post(`${config.botGateway}/bot/blacklist/check`, { user_id: self.userId })
      const settingPromise = axios.get(`${config.botGateway}/bot/settings_frontend`)
      const topicPromise = axios.get(`${config.botGateway}/bot/trendingTopics-light`)
      const categoryPromise = axios.get(`${config.botGateway}/bot/categories`)
      //const [checkResponse, settingResponse, topicResponse, categoryResponse] = await Promise.all([checkPromise, settingPromise, topicPromise, categoryPromise, sleep(30)])
      const [settingResponse, topicResponse, categoryResponse] = await Promise.all([settingPromise, topicPromise, categoryPromise])
      // if (checkResponse.data === 'BLOCKED') {
      //   self.blocked(true)
      //   self.loading(false)
      //   await self.youAreBlocked()
      //   return
      // }
      self.settings = settingResponse.data.payload

      self.initWebSocketIfNeeded();

      self.loading(false)
      self.trendingMessage = {
        type: 'trending',
        timestamp: format(new Date(), 'HH:mm'),
        topics: topicResponse.data.payload,
        categories: categoryResponse.data.payload
      }

      if (config.max_history_records > 0) {
        loadConversationHistory();
      }

      if (self.operationStack.length === 0) {
        addToMessageList({
          type: 'text',
          timestamp: format(now, 'HH:mm'),
          body: `${hello}，` + self.settings['welcome_message']
        });
        self.sayHelloNoWait();
      }
      await deferedScrollDown();

      setInterval(() => {
        self.sendToBot({ "t": "hb" });
      }, 55000);
    }
    self.initialize();
  }
}

ko.components.register('bot', {
  viewModel: BotViewModel,
  template: botTemplate
})