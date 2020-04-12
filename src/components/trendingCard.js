import ko from 'knockout'
import format from 'date-fns/format'
import trendingCardTemplate from '../templates/trendingCard.html'
import display from '../message.js'
class TrendingCardViewModel {
  constructor(params) {
    const self = this
    self.display=display
    self.currentTab = ko.observable('topics')
    self.showTopics = ko.computed(() => {
      return self.currentTab() === 'topics'
    })

    self.topics = params.message.topics
    self.categories = params.message.categories
    self.bot = params.bot

    self.switchToTab = (tab, _data, _event) => {
      self.currentTab(tab)
    }

    self.loadTopic = async function (_data, event) {
      var target = event.currentTarget ? event.currentTarget : event.srcElement
      const topicId = target.getAttribute('data-topic-id')
      const topic = self.topics.filter(topic => topic.id === topicId)[0]
      const message = {
        type: 'answer',
        timestamp: format(new Date(), 'HH:mm'),
        body: topic.answer
      }

      await self.bot.appendQuestion(topic.question)

      if (self.bot.blocked()) {
        self.bot.youAreBlocked()
        return
      }

      await self.bot.appendMessage(message)
      await self.bot.recordQuestion(topic.question)
    }

    self.loadTopics = async function (_data, event) {
      var target = event.currentTarget ? event.currentTarget : event.srcElement
      const categoryId = target.getAttribute('data-category-id')
      const category = self.categories.filter(category => category.id === categoryId)[0]

      await self.bot.appendQuestion(category.name)

      if (self.bot.blocked()) {
        self.bot.youAreBlocked()
        return
      }
      
      await self.bot.loadTopics(categoryId)
    }
  }
}

ko.components.register('trending-card', {
  viewModel: TrendingCardViewModel,
  template: trendingCardTemplate
})
