import re

RATE = 3.0

entries = [
    ("FrameQ，本地优先视频转写", 0, 5),
    ("链接转文字稿与话题", 5, 8),
    ("首次下载本地 ASR 模型", 8, 11.5),
    ("轻量安装，可取消", 11.5, 15),
    ("不打包模型与配置", 15, 18),
    ("确认额度，LLM 服务端配置", 18, 23),
    ("ASR 与输出目录用户管理", 23, 28),
    ("主界面只保留命令输入", 28, 31.5),
    ("粘贴链接，点击确认", 31.5, 35),
    ("校验域名，拒绝伪装", 35, 39),
    ("下载校验转写，全在本地", 39, 43),
    ("实时显示阶段进度与状态", 43, 47),
    ("稳定布局，结果完成后展现", 47, 51),
    ("流程完成，四个产物入口", 51, 55),
    ("视频音频定位文件", 55, 59),
    ("文字稿可搜索导出", 59, 62),
    ("话题点需二次确认", 62, 65),
    ("确认后发云端，消耗额度", 65, 69),
    ("按话题生成开放问题", 69, 72),
    ("历史面板查看任务", 72, 75),
    ("任务中断产物保留", 75, 78),
    ("可单独重试话题点", 78, 81),
    ("FrameQ，清楚可恢复的工作流", 81, 86),
]


def estimate_tts(text, rate=RATE):
    cn = len(re.findall(r'[\u4e00-\u9fff]', text))
    en = len(re.findall(r'[A-Za-z]', text))
    digits = len(re.findall(r'[0-9]', text))
    commas = text.count('\uff0c') + text.count(',')
    periods = text.count('\u3002') + text.count('.')
    time_cn = cn / rate
    time_en = en / (rate * 1.8)
    time_digits = digits / (rate * 1.3)
    time_pause = commas * 0.25 + periods * 0.45
    return time_cn + time_en + time_digits + time_pause


print("Final SRT Timing Verification")
print(f"TTS rate: {RATE} Chinese chars/sec")
print(f"{'#':>3}  {'Window':>12}  {'Dur':>5}  {'CN':>3} {'EN':>3}  {'Est':>6}  {'Gap':>7}  Text")
print("-" * 98)

total_over = 0
total_est = 0
all_ok = True
for i, (text, start, end) in enumerate(entries, 1):
    dur = end - start
    cn = len(re.findall(r'[\u4e00-\u9fff]', text))
    en = len(re.findall(r'[A-Za-z]', text))
    est = estimate_tts(text)
    total_est += est
    gap = dur - est
    if gap < -0.1:
        total_over += abs(gap)
        all_ok = False
        flag = "  ** OVER **"
    elif gap < 0:
        flag = "  ~ tight"
    else:
        flag = ""
    print(f"{i:>3}  {start:>5.1f}-{end:>5.1f}s  {dur:>4.1f}s  {cn:>3}  {en:>3}  {est:>5.2f}s  {gap:>+6.2f}s  {text}{flag}")

video_len = entries[-1][2]
print(f"\n---")
print(f"TTS total: {total_est:.1f}s / Video: {video_len}s (slack: {video_len - total_est:.1f}s)")
print(f"Result: {'ALL PASS' if all_ok else 'SOME OVER'}  |  Chinese chars: {sum(len(re.findall(r'[\u4e00-\u9fff]', t[0])) for t in entries)}")
