$esc = [char]27
$bel = [char]7
function global:prompt {
    $location = $executionContext.SessionState.Path.CurrentLocation.Path
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($location))
    [Console]::Write("$([char]27)]777;$env:PERSON_SESSION_TOKEN;P;$encoded$([char]7)")
    "$([char]27)[0;38;5;214m$([char]0x03A9)$([char]27)[0m $location> "
}
try { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch {}
try { Set-PSReadLineOption -Colors @{ Command = "$esc[39m" } -ErrorAction Stop } catch {}
