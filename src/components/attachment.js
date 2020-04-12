import ko from 'knockout'

import attachmentTemplate from '../templates/attachment.html'

class AttachmentViewModel {
  constructor(params) {
    const self = this;
    self.message = params.message;
    console.log("****msg", self.message);
    self.bot = params.bot;
    self.imageLoaded = function (_data, event) {
      console.log("Imaged Loaded");
    }
  }
}

ko.components.register('attachment', {
  viewModel: AttachmentViewModel,
  template: attachmentTemplate
})
