// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  JSONObject
} from '@phosphor/coreutils';

import {
  Menu
} from '@phosphor/widgets';

import {
  JupyterLab, JupyterLabPlugin
} from '@jupyterlab/application';

import {
  ICommandPalette, IMainMenu
} from '@jupyterlab/apputils';

import {
  IEditorServices
} from '@jupyterlab/codeeditor';

import {
  editorServices, CodeMirrorEditor, Mode
} from '@jupyterlab/codemirror';

import {
  ISettingRegistry, IStateDB
} from '@jupyterlab/coreutils';

import {
  IEditorTracker
} from '@jupyterlab/fileeditor';


/**
 * The command IDs used by the codemirror plugin.
 */
namespace CommandIDs {
  export
  const matchBrackets = 'codemirror:match-brackets';

  export
  const changeKeyMap = 'codemirror:change-keymap';

  export
  const changeTheme = 'codemirror:change-theme';

  export
  const changeMode = 'codemirror:change-mode';

  export
  const changeTabs = 'codemirror:change-tabs';

  export
  const search = 'codemirror:search';

  export
  const searchReplace = 'codemirror:search-replace';

  export
  const jumpToLine = 'codemirror:jump-to-line';
};


/**
 * The editor services.
 */
export
const servicesPlugin: JupyterLabPlugin<IEditorServices> = {
  id: IEditorServices.name,
  provides: IEditorServices,
  activate: (): IEditorServices => editorServices
};


/**
 * The editor commands.
 */
export
const commandsPlugin: JupyterLabPlugin<void> = {
  id: 'jupyter.services.codemirror-commands',
  requires: [IEditorTracker, IMainMenu, ICommandPalette, IStateDB, ISettingRegistry],
  activate: activateEditorCommands,
  autoStart: true
};


/**
 * Export the plugins as default.
 */
const plugins: JupyterLabPlugin<any>[] = [commandsPlugin, servicesPlugin];
export default plugins;


/**
 * Set up the editor widget menu and commands.
 */
function activateEditorCommands(app: JupyterLab, tracker: IEditorTracker, mainMenu: IMainMenu, palette: ICommandPalette, state: IStateDB, settingRegistry: ISettingRegistry): void {
  const { commands, restored } = app;
  const { id } = commandsPlugin;
  let theme: string = CodeMirrorEditor.DEFAULT_THEME;
  let keyMap: string = 'default';
  let matchBrackets = false;

  // Annotate the plugin settings.
  settingRegistry.annotate(id, '', {
    iconClass: 'jp-ImageTextEditor',
    iconLabel: 'CodeMirror',
    label: 'CodeMirror'
  });
  settingRegistry.annotate(id, 'keyMap', { label: 'Key Map' });
  settingRegistry.annotate(id, 'matchBrackets', { label: 'Match Brackets' });
  settingRegistry.annotate(id, 'theme', { label: 'Theme' });

  /**
   * Update the setting values.
   */
  function updateSettings(settings: ISettingRegistry.ISettings): void {
    const cached = settings.get('matchBrackets') as boolean | null;
    matchBrackets = cached === null ? false : !!cached;
    keyMap = settings.get('keyMap') as string | null || keyMap;
    theme = settings.get('theme') as string | null || theme;
  }

  /**
   * Update the settings of the current tracker instances.
   */
  function updateTracker(): void {
    tracker.forEach(widget => {
      if (widget.editor instanceof CodeMirrorEditor) {
        let cm = widget.editor.editor;
        cm.setOption('keyMap', keyMap);
        cm.setOption('theme', theme);
        cm.setOption('matchBrackets', matchBrackets);
      }
    });
  }

  // Fetch the initial state of the settings.
  Promise.all([settingRegistry.load(id), restored]).then(([settings]) => {
    updateSettings(settings);
    updateTracker();
    settings.changed.connect(() => {
      updateSettings(settings);
      updateTracker();
    });
  });

  /**
   * Handle the settings of new widgets.
   */
  tracker.widgetAdded.connect((sender, widget) => {
    if (widget.editor instanceof CodeMirrorEditor) {
      let cm = widget.editor.editor;
      cm.setOption('keyMap', keyMap);
      cm.setOption('theme', theme);
      cm.setOption('matchBrackets', matchBrackets);
    }
  });

  // Update the command registry when the codemirror state changes.
  tracker.currentChanged.connect(() => {
    if (tracker.size <= 1) {
      commands.notifyCommandChanged(CommandIDs.matchBrackets);
    }
  });

  /**
   * A test for whether the tracker has an active widget.
   */
  function hasWidget(): boolean {
    return tracker.currentWidget !== null;
  }

  /**
   * A test for whether editor has focus.
   */
  function isEditorVisible(): boolean {
    return (tracker.currentWidget !== null &&
            tracker.currentWidget.editor instanceof CodeMirrorEditor &&
            tracker.currentWidget.isVisible);
  }

  /**
   * Create a menu for the editor.
   */
  function createMenu(): Menu {
    const menu = new Menu({ commands });
    const themeMenu = new Menu({ commands });
    const keyMapMenu = new Menu({ commands });
    const modeMenu = new Menu({ commands });
    const tabMenu = new Menu({ commands });

    menu.title.label = 'Editor';
    themeMenu.title.label = 'Theme';
    keyMapMenu.title.label = 'Key Map';
    modeMenu.title.label = 'Language';
    tabMenu.title.label = 'Tabs';

    commands.addCommand(CommandIDs.changeTheme, {
      label: args => args['theme'] as string,
      execute: args => {
        theme = args['theme'] as string || CodeMirrorEditor.DEFAULT_THEME;
        tracker.forEach(widget => {
          if (widget.editor instanceof CodeMirrorEditor) {
            let cm = widget.editor.editor;
            cm.setOption('theme', theme);
          }
        });
        return settingRegistry.set(id, 'theme', theme);
      },
      isEnabled: hasWidget,
      isToggled: args => args['theme'] === theme
    });

    commands.addCommand(CommandIDs.changeKeyMap, {
      label: args => {
        let title = args['keyMap'] as string;
        return title === 'sublime' ? 'Sublime Text' : title;
      },
      execute: args => {
        keyMap = args['keyMap'] as string || 'default';
        tracker.forEach(widget => {
          if (widget.editor instanceof CodeMirrorEditor) {
            let cm = widget.editor.editor;
            cm.setOption('keyMap', keyMap);
          }
        });
        return settingRegistry.set(id, 'keyMap', keyMap);
      },
      isEnabled: hasWidget,
      isToggled: args => args['keyMap'] === keyMap
    });

    commands.addCommand(CommandIDs.changeMode, {
      label: args => args['name'] as string,
      execute: args => {
        let mode = args['mode'] as string;
        if (mode) {
          let widget = tracker.currentWidget;
          let spec = Mode.findByName(mode);
          if (spec) {
            widget.model.mimeType = spec.mime;
          }
        }
      },
      isEnabled: hasWidget,
      isToggled: args => {
        let widget = tracker.currentWidget;
        if (!widget) {
          return false;
        }
        let mime = widget.model.mimeType;
        let spec = Mode.findByMIME(mime);
        let mode = spec && spec.mode;
        return args['mode'] === mode;
      }
    });

    commands.addCommand(CommandIDs.changeTabs, {
      label: args => args['name'] as string,
      execute: args => {
        let widget = tracker.currentWidget;
        if (!widget) {
          return;
        }
        let editor = widget.editor as CodeMirrorEditor;
        let size = args['size'] as number || 4;
        let tabs = !!args['tabs'];
        editor.editor.setOption('indentWithTabs', tabs);
        editor.editor.setOption('indentUnit', size);
      },
      isEnabled: hasWidget,
      isToggled: args => {
        let widget = tracker.currentWidget;
        if (!widget) {
          return false;
        }
        let tabs = !!args['tabs'];
        let size = args['size'] as number || 4;
        let editor = widget.editor as CodeMirrorEditor;
        if (editor.editor.getOption('indentWithTabs') !== tabs) {
          return false;
        }
        return editor.editor.getOption('indentUnit') === size;
      }
    });

    let args: JSONObject = { tabs: true, size: 4, name: 'Indent with Tab' };
    tabMenu.addItem({ command: CommandIDs.changeTabs, args });
    palette.addItem({
      command: CommandIDs.changeTabs, args, category: 'Editor'
    });

    for (let size of [1, 2, 4, 8]) {
      let args: JSONObject = {
        tabs: false, size, name: `Spaces: ${size} `
      };
      tabMenu.addItem({ command: CommandIDs.changeTabs, args });
      palette.addItem({
        command: CommandIDs.changeTabs, args, category: 'Editor'
      });
    }

    Mode.getModeInfo().sort((a, b) => {
      return a.name.localeCompare(b.name);
    }).forEach(spec => {
      modeMenu.addItem({
        command: CommandIDs.changeMode,
        args: {...spec}
      });
    });

    [
     'jupyter', 'default', 'abcdef', 'base16-dark', 'base16-light',
     'hopscotch', 'material', 'mbo', 'mdn-like', 'seti', 'the-matrix',
     'xq-light', 'zenburn'
    ].forEach(name => themeMenu.addItem({
      command: CommandIDs.changeTheme,
      args: { theme: name }
    }));

    ['default', 'sublime', 'vim', 'emacs'].forEach(name => {
      keyMapMenu.addItem({
        command: CommandIDs.changeKeyMap,
        args: { keyMap: name }
      });
    });

    menu.addItem({ type: 'submenu', submenu: modeMenu });
    menu.addItem({ type: 'submenu', submenu: tabMenu });
    menu.addItem({ type: 'separator' });
    menu.addItem({ command: 'editor:line-numbers' });
    menu.addItem({ command: 'editor:word-wrap' });
    menu.addItem({ command: CommandIDs.matchBrackets });
    menu.addItem({ type: 'submenu', submenu: keyMapMenu });
    menu.addItem({ type: 'submenu', submenu: themeMenu });
    menu.addItem({ type: 'separator' });
    menu.addItem({ command: CommandIDs.search });
    menu.addItem({ command: CommandIDs.searchReplace });
    menu.addItem({ command: CommandIDs.jumpToLine });

    return menu;
  }

  mainMenu.addMenu(createMenu(), { rank: 30 });

  commands.addCommand(CommandIDs.matchBrackets, {
    execute: () => {
      matchBrackets = !matchBrackets;
      tracker.forEach(widget => {
        const editor = widget.editor;
        if (editor instanceof CodeMirrorEditor) {
          const cm = editor.editor;
          cm.setOption('matchBrackets', matchBrackets);
        }
      });
      return settingRegistry.set(id, 'matchBrackets', matchBrackets);
    },
    label: 'Match Brackets',
    isEnabled: hasWidget,
    isToggled: () => matchBrackets
  });

  commands.addCommand(CommandIDs.search, {
    label: 'Search',
    execute: args => {
      let widget = tracker.currentWidget;
      if (widget.editor instanceof CodeMirrorEditor) {
        widget.editor.execCommand("find");
      }
    },
    isEnabled: isEditorVisible
  });

  commands.addCommand(CommandIDs.searchReplace, {
    label: 'Search and Replace',
    execute: args => {
      let widget = tracker.currentWidget;
      if (widget.editor instanceof CodeMirrorEditor) {
        widget.editor.execCommand("replace");
      }
    },
    isEnabled: isEditorVisible
  });

  commands.addCommand(CommandIDs.jumpToLine, {
    label: 'Jump to Line',
    execute: args => {
      let widget = tracker.currentWidget;
      if (widget.editor instanceof CodeMirrorEditor) {
        widget.editor.execCommand("jumpToLine");
      }
    },
    isEnabled: isEditorVisible
  });

  [
    'editor:line-numbers',
    'editor:line-wrap',
    CommandIDs.matchBrackets,
    CommandIDs.search,
    CommandIDs.searchReplace,
    CommandIDs.jumpToLine,
    'editor:create-console',
    'editor:run-code'
  ].forEach(command => palette.addItem({ command, category: 'Editor' }));

}
