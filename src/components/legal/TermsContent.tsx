/**
 * 利用規約の本文（見出し h2 を含まない本体のみ）。
 * /terms ページと、ログイン画面のモーダル（LegalInfoDialog）の両方から使い、
 * 内容を1箇所に集約して食い違いを防ぐ。純粋な JSX なのでサーバー/クライアント両方で利用可。
 *
 * 節の並びと言葉づかいは Hosteka（https://hosteka.piyo.me/terms）と揃えてある。
 * 同じ管理者の別サービスなので、読む人が同じ順に同じものを探せる。片方を直すときはもう片方も見ること。
 *
 * 条番号は外から指さない（節を足すと番号がずれる）。
 */
export function TermsContent() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        SHAMEZO（以下「本サービス」）をご利用いただくにあたり、本サービスを利用する全ての方（以下「ユーザー」）は、以下の利用規約に同意したうえでご利用ください。本サービスの運営者を以下「管理者」といいます。
      </p>

      {/* 増やさない。4つを超えると、どれも重要でないのと同じになる。下の条文はこれを詳しく書いたもの。 */}
      <div className="rounded-lg border-2 border-primary bg-primary/5 p-5 shadow-sm">
        <p className="flex items-center gap-2 text-base font-bold text-primary mb-3">
          特に重要なルール
        </p>
        <ul className="list-disc list-inside text-sm text-foreground space-y-2 font-medium">
          <li>みんなで楽しく使いましょう。</li>
          <li>他の誰かが撮影または作成したものではなく、自分が権利をもつ画像のみを投稿しましょう。</li>
          <li>法令・公序良俗・道徳に反する投稿はやめましょう。</li>
          <li>意図的にサーバーに負荷をかける行為はやめましょう。</li>
        </ul>
      </div>

      <div className="bg-muted rounded-lg p-4">
        <p className="font-medium mb-3">第1条（禁止される投稿）</p>
        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-2">
          <li>法令または公序良俗に違反する投稿</li>
          <li>犯罪行為または犯罪行為の疑いのある投稿</li>
          <li>自殺・自傷行為・薬物乱用・犯罪への加担（いわゆる闇バイトへの募集を含みます。）など、反社会的な内容を含む投稿</li>
          <li>反社会的勢力に対して直接または間接に利益を供与する投稿</li>
          <li>過度に暴力的または性的な投稿（児童ポルノの投稿を含みます。）</li>
          <li>青少年の健全な育成に悪影響を与える可能性のある投稿</li>
          <li>自らが権利を有しない画像の投稿、管理者または他のユーザーまたは第三者の知的財産権・肖像権・プライバシー・名誉その他の権利または利益を侵害する投稿</li>
          <li>管理者または他のユーザーまたは第三者への嫌がらせを目的とした投稿</li>
          <li>人種・国籍・信条・性別・社会的身分・門地等による差別を目的とした投稿</li>
          <li>その他、管理者が不適切と判断する投稿</li>
        </ul>
      </div>

      <div className="bg-muted rounded-lg p-4">
        <p className="font-medium mb-3">第2条（禁止される行為）</p>
        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-2">
          <li>法令または公序良俗に違反する行為</li>
          <li>犯罪行為または犯罪行為の疑いのある行為</li>
          <li>他のユーザーに成りすます行為</li>
          <li>複数のアカウントを使って利用の制限を逃れ、または他のユーザーを欺く行為</li>
          <li>意図的にサーバーに過度な負荷をかける行為</li>
          <li>不正アクセスやクローリング・スクレイピング等の行為（データがほしい方は管理者に相談してください）</li>
          <li>本サービスの運営を妨害する行為</li>
          <li>本規約上の地位または権利義務を、第三者に譲渡し、または担保に供する行為</li>
          <li>その他、管理者が不適切と判断する行為</li>
        </ul>
      </div>

      <div className="bg-muted rounded-lg p-4">
        <p className="font-medium mb-2">第3条（免責事項）</p>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            本サービスは現状有姿（AS-IS）で提供されます。管理者は、サービスの継続性・可用性・法律上の瑕疵がないことを、明示的にも暗黙的にも保証しません。管理者は、いつでも本サービスの提供の停止、中断、内容の変更または終了を行うことができ、それによってユーザーが被った不利益または損害について責任を負いません。管理者は、ユーザーのデータを保全し、またはバックアップする義務を負いません。また、ユーザーの投稿内容については、投稿したユーザー本人が責任を負うものとします。
          </p>
          {/* 全部免責のままにしない。相手は消費者なので、事業者の責任を全部免除する条項は
              消費者契約法8条で無効になりうる。無効になると制限が丸ごと落ちて無限定の責任に
              戻るため、上限を切ったほうが強い。本規約のすべての免責にかかるので、ここに1か所だけ置く。 */}
          <p>
            本規約における管理者の免責は、管理者に故意または重大な過失がある場合には適用されません。この場合において管理者が負う責任は、通常生じうる直接かつ現実の損害に限られ、特別の事情から生じた損害、逸失利益、間接損害および第三者からの請求に基づく損害を含まないものとします。
          </p>
        </div>
      </div>

      <div className="bg-muted rounded-lg p-4">
        <p className="font-medium mb-2">第4条（ユーザーによる補償）</p>
        {/* 無過失の補償にしない。「投稿に関連して」まで広げると落ち度の無いユーザーまで費用を
            負い、消費者契約法10条で条項ごと無効を争われやすい。 */}
        <p className="text-sm text-muted-foreground">
          ユーザーは、本規約に違反したこと、またはユーザーの責めに帰すべき事由により、管理者が第三者から請求を受け、または損害を被った場合、その対応に要した費用（合理的な弁護士費用を含みます。）および損害を補償するものとします。
        </p>
      </div>

      <div className="bg-muted rounded-lg p-4">
        <p className="font-medium mb-2">第5条（ユーザー間の紛争）</p>
        <p className="text-sm text-muted-foreground">
          ユーザー間、またはユーザーと第三者との間で生じた紛争は、当事者間で解決するものとし、管理者は関与しません。管理者は、当該紛争によってユーザーが被った損害について責任を負いません。
        </p>
      </div>

      <div className="bg-muted rounded-lg p-4">
        <p className="font-medium mb-2">第6条（利用制限）</p>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            利用規約に逸脱した利用が認められる場合、管理者は事前の通知なく投稿の削除やアカウントの停止など必要な処置をとることがあります。
          </p>
          <p>
            他のユーザーの投稿に問題があるときは、その投稿のページの通報から管理者にお知らせください。ただし、管理者は、通報に対応する義務を負わず、対応の有無および内容について説明する義務を負いません。
          </p>
        </div>
      </div>

      <div className="bg-muted rounded-lg p-4">
        <p className="font-medium mb-2">第7条（反社会的勢力の排除）</p>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            ユーザーは、暴力団、暴力団員、暴力団員でなくなった時から5年を経過しない者、暴力団準構成員、暴力団関係企業、総会屋、社会運動等標ぼうゴロ、特殊知能暴力集団等、その他これらに準ずる者（以下、「反社会的勢力」といいます。）に該当しないこと、およびこれらの者と以下の関係を有しないことを表明し、かつ将来にわたっても該当しないことを確約するものとします。
          </p>
          <ol className="list-decimal list-inside space-y-1">
            <li>反社会的勢力が経営を支配していると認められる関係</li>
            <li>反社会的勢力が経営に実質的に関与していると認められる関係</li>
            <li>自己もしくは第三者の不正の利益を図る目的または第三者に損害を加える目的をもってするなど、不当に反社会的勢力を利用していると認められる関係</li>
            <li>反社会的勢力に対して資金等を提供し、または便宜を供与するなどの関与をしていると認められる関係</li>
            <li>役員または経営に実質的に関与している者が反社会的勢力と社会的に非難されるべき関係を有していると認められる関係</li>
          </ol>
          <p>
            ユーザーが前項の規定に違反した場合、管理者は何らの催告なしに本サービスの利用を停止し、またはユーザーとしての登録を抹消することができるものとします。この場合、管理者はユーザーに対し、何らの責任を負わないものとします。
          </p>
        </div>
      </div>

      <div className="bg-muted rounded-lg p-4">
        <p className="font-medium mb-2">第8条（退会）</p>
        <p className="text-sm text-muted-foreground">
          ユーザーは、設定の画面からいつでも退会できます。退会すると、投稿した画像・実績・通知など、本サービスに記録されたデータは削除され、元に戻すことはできません。Fediverseサーバーへ送信済みの投稿は、退会しても削除されません。
        </p>
      </div>

      <div className="bg-muted rounded-lg p-4">
        <p className="font-medium mb-2">第9条（未成年者の利用）</p>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            未成年者は、あらかじめ法定代理人の同意を得たうえで本サービスを利用するものとします。
          </p>
          {/* 「同意を得たものとみなす」にしない。一方的なみなし規定では民法5条2項の取消権は
              消えない。義務として書いたうえで、民法21条（詐術）に乗せる一文を置く。
              ただし年齢を集めておらず成年であると表明させる画面も無いので、詐術の主張は弱い。 */}
          <p>
            法定代理人の同意を得ていないにもかかわらず、同意を得ていると偽って本サービスを利用した場合、本サービスに関する行為を取り消すことはできないものとします。
          </p>
        </div>
      </div>

      <div className="bg-muted rounded-lg p-4">
        <p className="font-medium mb-2">第10条（著作権）</p>
        <p className="text-sm text-muted-foreground">
          ユーザーが本サービスを利用して投稿した文章、画像等の著作権については、当該ユーザーその他既存の権利者に留保されるものとします。
        </p>
      </div>

      <div className="bg-muted rounded-lg p-4">
        <p className="font-medium mb-3">第11条（個人情報の扱い）</p>
        <p className="text-sm text-muted-foreground">
          本サービスの利用によって取得する個人情報は、別途定める
          <a href="/privacy" className="text-primary hover:underline">
            プライバシーポリシー
          </a>
          に従い適切に取り扱うものとします。
        </p>
      </div>

      <div className="bg-muted rounded-lg p-4">
        <p className="font-medium mb-3">第12条（利用規約の変更）</p>
        <p className="text-sm text-muted-foreground">
          利用規約は予告なく変更されることがあります。重要な変更がある場合は、サービス上でお知らせします。変更後も本サービスを利用継続している場合、変更後の利用規約に同意したものと見なします。
        </p>
      </div>

      <div className="bg-muted rounded-lg p-4">
        <p className="font-medium mb-3">第13条（分離可能性）</p>
        <p className="text-sm text-muted-foreground">
          本規約のいずれかの条項またはその一部が無効または執行不能と判断された場合であっても、残りの規定は引き続き完全に効力を有するものとします。
        </p>
      </div>

      <div className="bg-muted rounded-lg p-4">
        <p className="font-medium mb-3">第14条（準拠法・裁判管轄）</p>
        <p className="text-sm text-muted-foreground">
          本規約の解釈にあたっては、日本法を準拠法とします。本規約に関する紛争については、管理者の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
        </p>
      </div>

      <p className="text-xs text-muted-foreground text-center">最終更新日：2026年10月5日</p>
    </div>
  );
}
