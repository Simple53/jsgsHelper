# ===================================================
# 江苏高校师资培训中心 - 课程视频批量下载脚本
# MP4 使用 aria2c 多线程下载
# M3U8 使用 N_m3u8DL-RE 下载合并
# 共 5 门课程，113 个视频
# ===================================================

$BaseDir = "$PSScriptRoot\videos"

# 创建各课程目录
$courses = @(
    "01_高等教育学",
    "02_高等教育心理学",
    "03_高等教育政策与法律",
    "04_高校教师职业道德规范",
    "05_习近平总书记教育重要论述"
)
foreach ($c in $courses) {
    New-Item -ItemType Directory -Force -Path "$BaseDir\$c" | Out-Null
}

Write-Host "下载目录已创建: $BaseDir"
Write-Host "开始批量下载，共 113 个视频..."
Write-Host ""

# ===================================================
# 第一门：高等教育学 (30个 MP4)
# ===================================================
Write-Host "[课程 1/5] 高等教育学 - 30 个视频 (MP4)"
$dir1 = "$BaseDir\01_高等教育学"
$videos1 = @(
    @{n="01_第一节 高等教育与高等教育学.mp4"; u="http://jk-source.study.gspxonline.com/ac36430a2a9ee1532521ec5087f76bc2e2ee9258.mp4"},
    @{n="02_第二节 西方高等教育发展史.mp4"; u="http://jk-source.study.gspxonline.com/2697b80aaf94cedaa23a6833d1bc6886812ad0d2.mp4"},
    @{n="03_第三节 中国高等教育发展史.mp4"; u="http://jk-source.study.gspxonline.com/676fc55d738c67a9c0c98788a7787e60604d1e1d.mp4"},
    @{n="04_第四节 王一军-高等教育理念的构成要素.mp4"; u="http://jk-source.study.gspxonline.com/4ba237112941d86314231eeabe18b0fc86c8b174.mp4"},
    @{n="05_第五节 王一军-高等教育理念的主要流派.mp4"; u="http://jk-source.study.gspxonline.com/572fd76b28c1002526b94d7104bf4ecb49663898.mp4"},
    @{n="06_第六节 陈何芳-高等学校教育制度.mp4"; u="http://jk-source.study.gspxonline.com/e352b3c9ab30c68a17d540c96e507759c72d7ceb.mp4"},
    @{n="07_第七节 陈何芳-高等教育办学体制.mp4"; u="http://jk-source.study.gspxonline.com/38253d5c7108d1420e7b6ea23b0314c256b3108f.mp4"},
    @{n="08_第八节 陈何芳-高等教育管理制度.mp4"; u="http://jk-source.study.gspxonline.com/63ee85f4d92e1c76e0259b53c9d95245ddf95af9.mp4"},
    @{n="09_第九节 陈何芳-高等教育评价制度.mp4"; u="http://jk-source.study.gspxonline.com/d2688d40f14596a35f2f8b094c94983af9bcb781.mp4"},
    @{n="10_第十节 宋华明-高等教育的个体功能.mp4"; u="http://jk-source.study.gspxonline.com/b04c5f87a30e46505921dd1d82cb53e535a5a7a1.mp4"},
    @{n="11_第十一节 宋华明-高等教育的社会功能.mp4"; u="http://jk-source.study.gspxonline.com/f7b5fd6ca61fd79d0aaddbd8c7f623b4d9315788.mp4"},
    @{n="12_第十二节 宋华明-高等学校的职能.mp4"; u="http://jk-source.study.gspxonline.com/208807d83e258b772e04c4b7068d0452d7a2cd48.mp4"},
    @{n="13_第十三节 王一军-高等学校课程理论.mp4"; u="http://jk-source.study.gspxonline.com/e7de5018300b18962f7ef17fba10c3d2a2da41f6.mp4"},
    @{n="14_第十四节 王一军-高等学校课程规划.mp4"; u="http://jk-source.study.gspxonline.com/ae46c64a9a596cc152d8a9e6232b24c64282f6d5.mp4"},
    @{n="15_第十五节 王一军-高等学校课程编制.mp4"; u="http://jk-source.study.gspxonline.com/2b05d2f5fdb8e94b9cba7ce3fffddb9bca3f5dc0.mp4"},
    @{n="16_第十六节 王一军-高等学校课程管理.mp4"; u="http://jk-source.study.gspxonline.com/18918e876635cf8a4e6e100568f4438010f75b02.mp4"},
    @{n="17_第十七节 高等学校教学原则.mp4"; u="http://jk-source.study.gspxonline.com/a6106611b7219eef3b1ea21c5a063ed759a56053.mp4"},
    @{n="18_第十八节 高等学校教学方法.mp4"; u="http://jk-source.study.gspxonline.com/04c0d5c2b0819d6551dd5c57d5bb94389f1bab56.mp4"},
    @{n="19_第十九节 高等学校教学环节和组织形式.mp4"; u="http://jk-source.study.gspxonline.com/ca8559cc98938d529f46fa5623c33db3c4c13716.mp4"},
    @{n="20_第二十节 宋明华-学科的基本理论.mp4"; u="http://jk-source.study.gspxonline.com/f38e7a1d6fd2575adeeee290f18aaeacc074c617.mp4"},
    @{n="21_第二十一节 宋明华-高等学校的学科建设.mp4"; u="http://jk-source.study.gspxonline.com/b7f7323e39b4046a2d65f4c38ba045133685e01f.mp4"},
    @{n="22_第二十二节 宋华明-高等学校的科学研究.mp4"; u="http://jk-source.study.gspxonline.com/cc42cd868e7d246912b68d7a95ce877c048ed71f.mp4"},
    @{n="23_第二十三节 周萍-高等学校的教师特点.mp4"; u="http://jk-source.study.gspxonline.com/b64deae03d9483a08b1411beb885b021dc61924c.mp4"},
    @{n="24_第二十四节 周萍-高等学校教师的专业发展理论.mp4"; u="http://jk-source.study.gspxonline.com/cd96f7e4b1cd5bb56570f14509358c47a94bd6a9.mp4"},
    @{n="25_第二十五节 周萍-高等学校教师专业发展模式与途径.mp4"; u="http://jk-source.study.gspxonline.com/479f01e8872bf676e32f86fe207a37987638e0f2.mp4"},
    @{n="26_第二十六节 周萍-高等学校的教师管理.mp4"; u="http://jk-source.study.gspxonline.com/b59f75dd47ba3fffdc6bbb729785baa3827489d8.mp4"},
    @{n="27_第二十七节 陈-高等学校的组织特性和权力类型.mp4"; u="http://jk-source.study.gspxonline.com/36a6ef0e572e60743dede5b2a402037639cab6a9.mp4"},
    @{n="28_第二十八节 陈何芳-高等学校的管理过程和高等学校治理.mp4"; u="http://jk-source.study.gspxonline.com/87a4282f4dce78ffdd3976905c1c9ebfce6ca880.mp4"},
    @{n="29_第二十九节 周萍-高等教育研究的类型和方法.mp4"; u="http://jk-source.study.gspxonline.com/854ee15a34a05ba53529ce3c07f114b0fc4cf726.mp4"},
    @{n="30_第三十节 周萍-高等教育研究的过程和规范.mp4"; u="http://jk-source.study.gspxonline.com/17a9b4f985a82a040ddf60aeb1303efaa795e22a.mp4"}
)
$i = 0
foreach ($v in $videos1) {
    $i++
    $outPath = "$dir1\$($v.n)"
    if (Test-Path $outPath) {
        Write-Host "  [$i/30] 已存在，跳过: $($v.n)"
        continue
    }
    Write-Host "  [$i/30] 下载: $($v.n)"
    aria2c -x 16 -s 16 -k 1M --file-allocation=none --console-log-level=warn `
        --header="Referer: http://jsgs.study.gspxonline.com/" `
        -d $dir1 -o $v.n $v.u
}

# ===================================================
# 第二门：高等教育心理学 (33个 M3U8)
# ===================================================
Write-Host ""
Write-Host "[课程 2/5] 高等教育心理学 - 33 个视频 (M3U8)"
$dir2 = "$BaseDir\02_高等教育心理学"
$videos2 = @(
    @{n="01_心理学讲什么"; u="http://jsgs-jk.gspxonline.com/2026xinlixue1.1.m3u8"},
    @{n="02_高等教育心理学的学习重点是什么"; u="http://jsgs-jk.gspxonline.com/2026xinlixue1.2.m3u8"},
    @{n="03_维姆斯基与最近发展区理论"; u="http://jsgs-jk.gspxonline.com/2026xinlixue1.3.m3u8"},
    @{n="04_马西娅同一性状态模型"; u="http://jsgs-jk.gspxonline.com/2026xinlixue2.1.m3u8"},
    @{n="05_艾宾浩斯遗忘曲线"; u="http://jsgs-jk.gspxonline.com/2026xinlixue2.2.m3u8"},
    @{n="06_大学生情绪情感特征与课堂育人应对"; u="http://jsgs-jk.gspxonline.com/2026xinlixue2.3.m3u8"},
    @{n="07_当代大学生对高校教师的核心期待"; u="http://jsgs-jk.gspxonline.com/2026xinlixue3.1.m3u8"},
    @{n="08_教师积极期待的力量"; u="http://jsgs-jk.gspxonline.com/2026xinlixue3.2.m3u8"},
    @{n="09_高校教师心理健康自我维护"; u="http://jsgs-jk.gspxonline.com/2026xinlixue3.3.m3u8"},
    @{n="10_学习的分类"; u="http://jsgs-jk.gspxonline.com/2026xinlixue4.1.m3u8"},
    @{n="11_建构主义的教学模式"; u="http://jsgs-jk.gspxonline.com/2026xinlixue4.2.m3u8"},
    @{n="12_动作技能的形成与练习"; u="http://jsgs-jk.gspxonline.com/2026xinlixue4.3.m3u8"},
    @{n="13_中国古代的学习策略思想"; u="http://jsgs-jk.gspxonline.com/2026xinlixue5.1.m3u8"},
    @{n="14_有效的资源管理策略"; u="http://jsgs-jk.gspxonline.com/2026xinlixue5.2.m3u8"},
    @{n="15_学习策略的教学"; u="http://jsgs-jk.gspxonline.com/2026xinlixue5.3.m3u8"},
    @{n="16_科尔伯格的道德认知发展理论"; u="http://jsgs-jk.gspxonline.com/2026xinlixue6.1.m3u8"},
    @{n="17_行为主义与良好道德行为养成"; u="http://jsgs-jk.gspxonline.com/2026xinlixue6.2.m3u8"},
    @{n="18_人际沟通"; u="http://jsgs-jk.gspxonline.com/2026xinlixue6.3.m3u8"},
    @{n="19_与学习动机相关的概念"; u="http://jsgs-jk.gspxonline.com/2026xinlixue7.1.m3u8"},
    @{n="20_成就动机理论及其教育启示"; u="http://jsgs-jk.gspxonline.com/2026xinlixue7.2.m3u8"},
    @{n="21_自我效能理论及其教育启发"; u="http://jsgs-jk.gspxonline.com/2026xinlixue7.3.m3u8"},
    @{n="22_提高问题解决能力的教学策略"; u="http://jsgs-jk.gspxonline.com/2026xinlixue8.1.m3u8"},
    @{n="23_创造性的测量"; u="http://jsgs-jk.gspxonline.com/2026xinlixue8.2.m3u8"},
    @{n="24_创造性的影响因素"; u="http://jsgs-jk.gspxonline.com/2026xinlixue8.3.m3u8"},
    @{n="25_集体及其积极作用"; u="http://jsgs-jk.gspxonline.com/2026xinlixue9.1.m3u8"},
    @{n="26_共情及其积极的心理效应"; u="http://jsgs-jk.gspxonline.com/2026xinlixue9.2.m3u8"},
    @{n="27_批评与批评艺术"; u="http://jsgs-jk.gspxonline.com/2026xinlixue9.3.m3u8"},
    @{n="28_现代人的健康观"; u="http://jsgs-jk.gspxonline.com/2026xinlixue10.1.m3u8"},
    @{n="29_体育运动与大学生的心理健康"; u="http://jsgs-jk.gspxonline.com/2026xinlixue10.2.m3u8"},
    @{n="30_如何识别大学生的心理问题"; u="http://jsgs-jk.gspxonline.com/2026xinlixue10.3.m3u8"},
    @{n="31_人格特质及其测量"; u="http://jsgs-jk.gspxonline.com/2026xinlixue11.1.m3u8"},
    @{n="32_人格发展理论"; u="http://jsgs-jk.gspxonline.com/2026xinlixue11.2.m3u8"},
    @{n="33_大学生的自我同一性的发展"; u="http://jsgs-jk.gspxonline.com/2026xinlixue11.3.m3u8"}
)
$i = 0
foreach ($v in $videos2) {
    $i++
    $outPath = "$dir2\$($v.n).mp4"
    if (Test-Path $outPath) {
        Write-Host "  [$i/33] 已存在，跳过: $($v.n)"
        continue
    }
    Write-Host "  [$i/33] 下载: $($v.n)"
    N_m3u8DL-RE $v.u --save-dir $dir2 --save-name $v.n -M format=mp4 --log-level WARN
}

# ===================================================
# 第三门：高等教育政策与法律 (26个 M3U8)
# ===================================================
Write-Host ""
Write-Host "[课程 3/5] 高等教育政策与法律 - 26 个视频 (M3U8)"
$dir3 = "$BaseDir\03_高等教育政策与法律"
$videos3 = @(
    @{n="01_绪论-教育法治化的历史趋势与内在逻辑"; u="http://jsgs-jk.gspxonline.com/jsgsfg0.1.m3u8"},
    @{n="02_绪论-教师的法治素养及教育政策与法律的关系"; u="http://jsgs-jk.gspxonline.com/jsgsfg0.2.m3u8"},
    @{n="03_1.1高等教育政策概论"; u="http://jsgs-jk.gspxonline.com/jsgsfg1.1.m3u8"},
    @{n="04_1.2高等教育政策的功能"; u="http://jsgs-jk.gspxonline.com/jsgsfg1.2.m3u8"},
    @{n="05_1.3高等教育政策的系统"; u="http://jsgs-jk.gspxonline.com/jsgsfg1.3.m3u8"},
    @{n="06_2.1高等教育组织政策"; u="http://jsgs-jk.gspxonline.com/jsgsfg2.1.m3u8"},
    @{n="07_2.2高等教育教师和学生政策"; u="http://jsgs-jk.gspxonline.com/jsgsfg2.2.m3u8"},
    @{n="08_2.3高等教育教学政策"; u="http://jsgs-jk.gspxonline.com/jsgsfg2.3.m3u8"},
    @{n="09_3.1高等教育法律的概念特征与功能"; u="http://jsgs-jk.gspxonline.com/jsgsfg3.1.m3u8"},
    @{n="10_3.2高等教育法律的制度构成"; u="http://jsgs-jk.gspxonline.com/jsgsfg3.2.m3u8"},
    @{n="11_3.3高等教育法律的运行"; u="http://jsgs-jk.gspxonline.com/jsgsfg3.3.m3u8"},
    @{n="12_4.1高等教育行政机关的法律地位"; u="http://jsgs-jk.gspxonline.com/jsgsfg4.1.m3u8"},
    @{n="13_4.2高等教育行政机关的法定职权"; u="http://jsgs-jk.gspxonline.com/jsgsfg4.2.m3u8"},
    @{n="14_4.3高等教育行政机关的法律责任"; u="http://jsgs-jk.gspxonline.com/jsgsfg4.3.m3u8"},
    @{n="15_5.1高等学校的设立与法律地位"; u="http://jsgs-jk.gspxonline.com/jsgsfg5.1.m3u8"},
    @{n="16_5.2高等学校的权利"; u="http://jsgs-jk.gspxonline.com/jsgsfg5.2.m3u8"},
    @{n="17_5.3高等学校的义务"; u="http://jsgs-jk.gspxonline.com/jsgsfg5.3.m3u8"},
    @{n="18_6.1高校教师法律身份"; u="http://jsgs-jk.gspxonline.com/jsgsfg6.1.m3u8"},
    @{n="19_6.2高校老师的权利和义务"; u="http://jsgs-jk.gspxonline.com/jsgsfg6.2.m3u8"},
    @{n="20_6.3高校教师职业发展制度"; u="http://jsgs-jk.gspxonline.com/jsgsfg6.3.m3u8"},
    @{n="21_7.1高校学生的法律地位与权利义务"; u="http://jsgs-jk.gspxonline.com/jsgsfg7.1.m3u8"},
    @{n="22_7.2高校学生学业证书和学位制度"; u="http://jsgs-jk.gspxonline.com/jsgsfg7.2.m3u8"},
    @{n="23_7.3高校学生管理"; u="http://jsgs-jk.gspxonline.com/jsgsfg7.3.m3u8"},
    @{n="24_8.1高等教育法律救济概述"; u="http://jsgs-jk.gspxonline.com/jsgsfg8.1.m3u8"},
    @{n="25_8.2教育申诉和复议制度"; u="http://jsgs-jk.gspxonline.com/jsgsfg8.2.m3u8"},
    @{n="26_8.3教育诉讼和仲裁制度"; u="http://jsgs-jk.gspxonline.com/jsgsfg8.3.m3u8"}
)
$i = 0
foreach ($v in $videos3) {
    $i++
    $outPath = "$dir3\$($v.n).mp4"
    if (Test-Path $outPath) {
        Write-Host "  [$i/26] 已存在，跳过: $($v.n)"
        continue
    }
    Write-Host "  [$i/26] 下载: $($v.n)"
    N_m3u8DL-RE $v.u --save-dir $dir3 --save-name $v.n -M format=mp4 --log-level WARN
}

# ===================================================
# 第四门：高校教师职业道德规范 (25个 MP4)
# ===================================================
Write-Host ""
Write-Host "[课程 4/5] 高校教师职业道德规范 - 25 个视频 (MP4)"
$dir4 = "$BaseDir\04_高校教师职业道德规范"
$videos4 = @(
    @{n="01_第一节 何为教师.mp4"; u="http://jk-source.study.gspxonline.com/9fe80f9c861cbc3e1c9eae46b64755ace2484e58.mp4"},
    @{n="02_第二节 道德与职业道德的内涵.mp4"; u="http://jk-source.study.gspxonline.com/00a1bac807562e783b91332d7fd781174610ed75.mp4"},
    @{n="03_第三节 我国古代教师职业道德规范.mp4"; u="http://jk-source.study.gspxonline.com/8d4687aae15053e5471f4f0715b51528a77a9ace.mp4"},
    @{n="04_第四节 我国现当代高校教师职业道德规范.mp4"; u="http://jk-source.study.gspxonline.com/de151d72d5d998be4a6a1d59e8d8708e9951053b.mp4"},
    @{n="05_第五节 世界各国高校教师职业道德规范.mp4"; u="http://jk-source.study.gspxonline.com/91cc96e8e6fdaef87eab164fcbc433d2114e94bb.mp4"},
    @{n="06_第六节 亚洲地区职业道德规范.mp4"; u="http://jk-source.study.gspxonline.com/fe1b86b665230cc4d5e217133dfda00ab36ff49b.mp4"},
    @{n="07_第七节 爱国的内涵.mp4"; u="http://jk-source.study.gspxonline.com/78fa4b515e9d0af910370d02897466c7277380f1.mp4"},
    @{n="08_第八节 爱国规范的具体要求.mp4"; u="http://jk-source.study.gspxonline.com/fc527aed2a96137ae49cc7501d60cac80f1ec3fd.mp4"},
    @{n="09_第九节 守法的内涵.mp4"; u="http://jk-source.study.gspxonline.com/09ac0280a25e19bb4ad73eadc666b23f630e16f4.mp4"},
    @{n="10_第十节 守法规范的具体要求.mp4"; u="http://jk-source.study.gspxonline.com/d10a98f45f09ee7a5bf318a5bc7b69ee0d53adb7.mp4"},
    @{n="11_第十一节 敬业的内涵与影响因素.mp4"; u="http://jk-source.study.gspxonline.com/508f55c347faf8e0366b835222cf03f542cefe9d.mp4"},
    @{n="12_第十二节 敬业规范的内容与要求.mp4"; u="http://jk-source.study.gspxonline.com/e8f47be2be6bf75f354b56be36f647ee71eea684.mp4"},
    @{n="13_第十三节 爱生的特征与意义.mp4"; u="http://jk-source.study.gspxonline.com/3182ff69d033e6397998e247b0305f8c0eadbaac.mp4"},
    @{n="14_第十四节 爱生规范的内容与要求.mp4"; u="http://jk-source.study.gspxonline.com/ced6ad532e4100ecd264da2a6dedcb1d96a4fcc0.mp4"},
    @{n="15_第十五节 教书育人的内涵.mp4"; u="http://jk-source.study.gspxonline.com/e61b8ea4c05ab51fe7a43dc5c65d852c30804970.mp4"},
    @{n="16_第十六节 教书育人的具体内容.mp4"; u="http://jk-source.study.gspxonline.com/23e63cc1ec29b63c320829d462d481dec8e47c1f.mp4"},
    @{n="17_第十七节 如何做到教书育人.mp4"; u="http://jk-source.study.gspxonline.com/21f5d223c4cd6a31e47b2754fd543934134f545b.mp4"},
    @{n="18_第十八节 何为严谨治学.mp4"; u="http://jk-source.study.gspxonline.com/16d673a70068dbda8bf112684c8284626c64c3eb.mp4"},
    @{n="19_第十九节 严谨治学的具体要求.mp4"; u="http://jk-source.study.gspxonline.com/e3e66f267e26989c2fecc5c1b2c59fafc08e1408.mp4"},
    @{n="20_第二十节 何为服务社会.mp4"; u="http://jk-source.study.gspxonline.com/f720453770440ce466ae47c41f3347fdc389c972.mp4"},
    @{n="21_第二十一节 服务社会的要求与实现方式.mp4"; u="http://jk-source.study.gspxonline.com/15d7b1bca4d1457bc79d84e4319c4885ada84f32.mp4"},
    @{n="22_第二十二节 何为为人师表.mp4"; u="http://jk-source.study.gspxonline.com/5796c5dcd1b66fc12a4389010f8b491849f61734.mp4"},
    @{n="23_第二十三节 为人师表规范要求.mp4"; u="http://jk-source.study.gspxonline.com/aff0a3b2ba505c042dddca9babd6a77756ce5fc4.mp4"},
    @{n="24_第二十四节 高校教师违反职业道德的认定.mp4"; u="http://jk-source.study.gspxonline.com/216276580ab268571343a72ea7009ef6d2ca6da0.mp4"},
    @{n="25_第二十五节 高校教师违反道德规范的处理办法.mp4"; u="http://jk-source.study.gspxonline.com/7990e7b93e25c475fc369c2b61d6124bdaf380c6.mp4"}
)
$i = 0
foreach ($v in $videos4) {
    $i++
    $outPath = "$dir4\$($v.n)"
    if (Test-Path $outPath) {
        Write-Host "  [$i/25] 已存在，跳过: $($v.n)"
        continue
    }
    Write-Host "  [$i/25] 下载: $($v.n)"
    aria2c -x 16 -s 16 -k 1M --file-allocation=none --console-log-level=warn `
        -d $dir4 -o $v.n $v.u
}

# ===================================================
# 第五门：习近平总书记教育重要论述 (9个 MP4)
# ===================================================
Write-Host ""
Write-Host "[课程 5/5] 习近平总书记教育重要论述 - 9 个视频 (MP4)"
$dir5 = "$BaseDir\05_习近平总书记教育重要论述"
$videos5 = @(
    @{n="01_第一节 教育部关于高校教师师德失范行为处理的指导意见.mp4"; u="http://jk-source.study.gspxonline.com/e8e8f4dd271e4b8b84118ef72921c92d332ece32.mp4"},
    @{n="02_第二节 深入学习理解习近平总书记教育重要论述1.mp4"; u="http://jk-source.study.gspxonline.com/652a99f0a0e996715f130feda9477f0f723bd042.mp4"},
    @{n="03_第三节 深入学习理解习近平总书记教育重要论述2.mp4"; u="http://jk-source.study.gspxonline.com/f4626c2649aeef59aebae15e6529dd0f3cf035cc.mp4"},
    @{n="04_第四节 深入学习理解习近平总书记教育重要论述3.mp4"; u="http://jk-source.study.gspxonline.com/b677e93af3726152039f80ee5ef6b4b8417ee36f.mp4"},
    @{n="05_第五节 深入学习理解习近平总书记教育重要论述4.mp4"; u="http://jk-source.study.gspxonline.com/7b320124a890aa033bdb0c5f11669e90f946727c.mp4"},
    @{n="06_第六节 深入学习理解习近平总书记教育重要论述5.mp4"; u="http://jk-source.study.gspxonline.com/df14d5f4563bdfcc51f82be024d9ad5bce10c39a.mp4"},
    @{n="07_第七节 深入学习理解习近平总书记教育重要论述6.mp4"; u="http://jk-source.study.gspxonline.com/8e6d9a44d35ee3f209ae603fdbe9c9483b1691aa.mp4"},
    @{n="08_第八节 深入学习理解习近平总书记教育重要论述7.mp4"; u="http://jk-source.study.gspxonline.com/06a4065ac73247c45639aae0b747978ea3ef3682.mp4"},
    @{n="09_第九节 新时代高校教师职业行为十项准则.mp4"; u="http://jk-source.study.gspxonline.com/8d0abc071b3019222c2381be3de7afbcc02b7cb0.mp4"}
)
$i = 0
foreach ($v in $videos5) {
    $i++
    $outPath = "$dir5\$($v.n)"
    if (Test-Path $outPath) {
        Write-Host "  [$i/9] 已存在，跳过: $($v.n)"
        continue
    }
    Write-Host "  [$i/9] 下载: $($v.n)"
    aria2c -x 16 -s 16 -k 1M --file-allocation=none --console-log-level=warn `
        -d $dir5 -o $v.n $v.u
}

Write-Host ""
Write-Host "======================================"
Write-Host "全部下载任务完成！"
Write-Host "视频保存目录: $BaseDir"
Write-Host "MP4 文件：高等教育学(30) + 高校教师职业道德规范(25) + 习近平总书记教育重要论述(9) = 64 个"
Write-Host "M3U8 合并：高等教育心理学(33) + 高等教育政策与法律(26) = 59 个"
Write-Host "======================================"
