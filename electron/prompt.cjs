// Session-only hooks. ANSI 214 follows the terminal theme's prompt gold.
function sshPrompt(token) {
  const hook=`printf '\\033]777;${token};P;%s\\007' "$(printf %s "$PWD" | base64 | tr -d '\\r\\n')"`;
  // Keep the real cwd in the integration marker. Only the displayed home-prefix
  // separator changes: ~/project becomes ~ /project, without evaluating paths.
  const bashPrompt=String.raw`case "$PWD" in "$HOME"/*) PS1='\[\033[0;38;5;214m\]Ω\[\033[0m\] ~ ${'${PWD#"$HOME"}'} \$ ';; *) PS1='\[\033[0;38;5;214m\]Ω\[\033[0m\] \w \$ ';; esac`;
  const directories=`if command ls --color=auto -d . >/dev/null 2>&1; then export LS_COLORS="\${LS_COLORS:+$LS_COLORS:}di=01;34:tw=01;34:ow=01;34:st=01;34"; if ! alias ls >/dev/null 2>&1 && ! declare -F ls >/dev/null 2>&1; then alias ls='ls --color=auto'; fi; fi;`;
  return ` __person_init='${token}'; if [ -n "$BASH_VERSION" ]; then ${directories} __person_prompt(){ ${bashPrompt}; ${hook}; }; __person_prompt >/dev/null; if [[ $(declare -p PROMPT_COMMAND 2>/dev/null) == 'declare -a'* ]]; then PROMPT_COMMAND+=(__person_prompt); else PROMPT_COMMAND="\${PROMPT_COMMAND:+$PROMPT_COMMAND; }__person_prompt"; fi; elif [ -n "$ZSH_VERSION" ]; then __person_prompt(){ ${hook}; }; precmd_functions+=(__person_prompt); PROMPT='%b%F{214}Ω%f %~ %# '; fi; printf '\\033]777;${token};S\\007'; unset __person_init\r`;
}
module.exports={sshPrompt};
