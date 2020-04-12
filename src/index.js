import '@babel/polyfill'
import ko from 'knockout'
import './components/bot.js'
import './style.css'
import display from './message.js'
class DummyIndexViewModel {
}
ko.applyBindings({ title: display.title }, document.getElementById("htmlHeader"));
ko.applyBindings(new DummyIndexViewModel(), document.getElementById('app'))
