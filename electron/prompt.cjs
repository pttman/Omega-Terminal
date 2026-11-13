// Session-only hooks. ANSI 214 follows the terminal theme's prompt gold.
function sshPrompt(token) {
  const hook=`printf '\\033]777;${token};P;%s\\007' "$(printf %s "$PWD" | base64 | tr -d '\\r\\n')"`;
  return ` __person_init='${token}'; if [ -n "$BASH_VERSION" ]; then __person_prompt(){ ${hook}; }; PS1='\\[\\033[0;38;5;214m\\]Ω\\[\\033[0m\\] \\w \\$ '; if [[ $(declare -p PROMPT_COMMAND 2>/dev/null) == 'declare -a'* ]]; then PROMPT_COMMAND+=(__person_prompt); else PROMPT_COMMAND="\${PROMPT_COMMAND:+$PROMPT_COMMAND; }__person_prompt"; fi; elif [ -n "$ZSH_VERSION" ]; then __person_prompt(){ ${hook}; }; precmd_functions+=(__person_prompt); PROMPT='%b%F{214}Ω%f %~ %# '; fi; printf '\\033]777;${token};S\\007'; unset __person_init\r`;
}
module.exports={sshPrompt};
