import ko from 'knockout'

import itemListTemplate from '../templates/itemList.html'
import display from '../message.js'

class ItemListViewModel {
  constructor(params) {
    const self = this;
    self.display = display
    self.message = params.message;
    self.items = params.message.items;
    self.bot = params.bot;
    self.loadItem = async function (_data, event) {
      // console.log("loadItem", _data);
      self.bot.appendQuestion(_data.label)
      if (_data.type === 'location') {
        if (navigator.geolocation) {
          window.navigator.geolocation.getCurrentPosition(function (position) {
            self.bot.sendMessage({
              "longitude": position.coords.longitude,
              "latitude": position.coords.latitude
            }, 'location');
          }, function (err) {
            self.bot.sendMessage({
              "longitude": 0,
              "latitude": 0
            }, 'location');
            alert('Failed to send your location[发送失败，无法获取地理位置]！');
            console.error('Failed to get geolocation', err);
          }, {
              enableHighAccuracy: true,
              timeout: 3000,
              maximumAge: 0
            });
        } else {
          self.bot.sendMessage({
            "longitude": 0,
            "latitude": 0
          }, 'location');
          alert('Location is not supported by your browser[发送失败，浏览器不支持获取地理位置]！');
          console.error('Failed to get geolocation', err);
        }
      } else {
        self.bot.sendMessage(_data.postback, 'postback');
      }
    };
    self.clickChoice = function (_data, event) {
      console.log("clickChoice", _data);
      let target = event.currentTarget ? event.currentTarget : event.srcElement;
      let title = target.getAttribute('data-item-title');
      self.bot.appendQuestion(title);
      self.bot.sendMessage(_data.postback, 'postback');
    };
  }
}

ko.components.register('item-list', {
  viewModel: ItemListViewModel,
  template: itemListTemplate
})
