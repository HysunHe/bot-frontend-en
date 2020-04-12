import ko from 'knockout'
import format from 'date-fns/format'
import topicListTemplate from '../templates/topicList.html'
import display from '../message.js'
class TopicListViewModel {
  constructor(params) {
    const self = this
    self.display=display
    self.topics = params.message.topics
    self.bot = params.bot

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
  }
}

ko.components.register('topic-list', {
  viewModel: TopicListViewModel,
  template: topicListTemplate
})
