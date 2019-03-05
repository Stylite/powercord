const { React, getModule } = require('powercord/webpack');
const { DragDropContext, Droppable } = window.ReactBeautifulDnd;

const Guild = require('./Guild.jsx');

module.exports = class Guilds extends React.Component {
  constructor (props) {
    super(props);

    this.onDragEnd = this._onDragEnd.bind(this);
    this.state = {
      hidden: false,
      openedFolders: []
    };
  }

  componentDidUpdate () {
  }

  render () {
    const guilds = this._getGuilds();

    return <DragDropContext onDragEnd={this.onDragEnd}>
      <Droppable droppableId="droppable">
        {(provided) => (
          <div
            className='powercord-guilds'
            ref={provided.innerRef}
          >

            {guilds.items.map(({ guild, index }) => <Guild
              key={guild.id}

              guild={guild}
              index={index}

              unread={this.props.unreadGuilds[guild.id]}
              mentions={this.props.mentionCounts[guild.id] || 0}

              selected={this.props.selectedGuildId === guild.id}
              audio={this.props.selectedVoiceGuildId === guild.id && this.props.mode === 'voice'}
              video={this.props.selectedVoiceGuildId === guild.id && this.props.mode === 'video'}

              setRef={e => this.props.setRef(guild.id, e)}
            />)}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>;
  }

  _getGuilds () {
    let { guilds } = this.props;
    let toggledMentions = 0;

    return {
      items: guilds,
      unreads: {}
    };
  }

  _onDragEnd (result) {
    if (!result.destination) {
      return;
    }

    const positions = this._reorder(this.props.guilds, result.source.index, result.destination.index).map(g => g.guild.id);
  }

  _reorder (list, startIndex, endIndex) {
    const result = Array.from(list);
    const [ removed ] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);

    return result;
  }
};
