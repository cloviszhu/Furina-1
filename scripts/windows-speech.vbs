' Windows Script Host + installed SAPI voices. No policy changes, no downloads.
Option Explicit
Dim speaker, tokens, mode, i, token, rows, fso, inputFile, outputStream
Set speaker = CreateObject("SAPI.SpVoice")
Set tokens = speaker.GetVoices()
mode = WScript.Arguments(0)
If mode = "list" Then
  rows = "["
  For i = 0 To tokens.Count - 1
    Set token = tokens.Item(i)
    If i > 0 Then rows = rows & ","
    rows = rows & "{""id"":" & i & ",""name"":""" & EscapeJSON(token.GetDescription()) & """,""language"":""" & token.GetAttribute("Language") & """,""localService"":true,""engine"":""windows-sapi""}"
  Next
  WScript.StdOut.Write rows & "]"
ElseIf mode = "speak" Then
  i = CInt(WScript.Arguments(1))
  If i < 0 Or i >= tokens.Count Then WScript.Quit 1
  Set fso = CreateObject("Scripting.FileSystemObject")
  ' -1 reads the generated UTF-16 text file, not arbitrary user scripts.
  Set inputFile = fso.OpenTextFile(WScript.Arguments(2), 1, False, -1)
  Dim text
  text = inputFile.ReadAll
  inputFile.Close
  If Len(text) < 1 Or Len(text) > 1000 Then WScript.Quit 1
  Set speaker.Voice = tokens.Item(i)
  Set outputStream = CreateObject("SAPI.SpFileStream")
  outputStream.Format.Type = 22
  outputStream.Open WScript.Arguments(3), 3, False
  Set speaker.AudioOutputStream = outputStream
  speaker.Speak text
  outputStream.Close
Else
  WScript.Quit 1
End If
Function EscapeJSON(value)
  value = Replace(value, "\", "\\")
  value = Replace(value, Chr(34), "\" & Chr(34))
  value = Replace(value, vbCr, "\r")
  EscapeJSON = Replace(value, vbLf, "\n")
End Function
