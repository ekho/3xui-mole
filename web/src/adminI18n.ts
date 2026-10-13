import polyglotI18nProvider from 'ra-i18n-polyglot';
import englishMessages from 'ra-language-english';
import type {Lang} from './i18n';

const russianMessages={...englishMessages,ra:{...englishMessages.ra,
 action:{...englishMessages.ra.action,
  add_filter:'Добавить фильтр',add:'Добавить',back:'Назад',cancel:'Отмена',clear_input_value:'Очистить',clone:'Копировать',confirm:'Подтвердить',create:'Создать',delete:'Удалить',edit:'Изменить',export:'Экспорт',list:'Список',refresh:'Обновить',remove_filter:'Убрать фильтр',remove_all_filters:'Убрать все фильтры',remove:'Убрать',reset:'Сбросить',save:'Сохранить',search:'Поиск',show:'Просмотр',sort:'Сортировка',undo:'Отменить',unselect:'Снять выбор',expand:'Развернуть',close:'Закрыть',open_menu:'Открыть меню',close_menu:'Закрыть меню',update:'Обновить',open:'Открыть',toggle_theme:'Сменить светлую/тёмную тему',update_application:'Перезагрузить приложение',
 },
 page:{...englishMessages.ra.page,
  dashboard:'Обзор',error:'Произошла ошибка',loading:'Загрузка',not_found:'Страница не найдена',empty:'Пока нет записей: %{name}.',invite:'Добавить запись?',access_denied:'Доступ запрещён',authentication_error:'Ошибка проверки доступа',
 },
 message:{...englishMessages.ra.message,
  about:'О приложении',access_denied:'У вас нет прав для доступа к этой странице.',are_you_sure:'Вы уверены?',authentication_error:'Не удалось проверить доступ. Повторите попытку.',auth_error:'Не удалось проверить сеанс.',details:'Подробности',error:'Не удалось выполнить запрос. Повторите попытку.',invalid_form:'Проверьте данные формы.',loading:'Подождите',no:'Нет',not_found:'Проверьте адрес страницы.',unsaved_changes:'Есть несохранённые изменения. Уйти со страницы и потерять их?',yes:'Да',placeholder_data_warning:'Не удалось обновить данные. Проверьте подключение.',
 },
 navigation:{...englishMessages.ra.navigation,
  clear_filters:'Очистить фильтры',no_filtered_results:'По заданным фильтрам ничего не найдено.',no_results:'Ничего не найдено.',no_more_results:'Страница %{page} недоступна. Вернитесь на предыдущую.',page_out_of_boundaries:'Страница %{page} недоступна',page_out_from_end:'Это последняя страница',page_out_from_begin:'Это первая страница',page_range_info:'%{offsetBegin}–%{offsetEnd} из %{total}',partial_page_range_info:'%{offsetBegin}–%{offsetEnd} из более чем %{offsetEnd}',current_page:'Страница %{page}',page:'Перейти на страницу %{page}',first:'Первая страница',last:'Последняя страница',next:'Следующая страница',previous:'Предыдущая страница',page_rows_per_page:'Записей на странице:',skip_nav:'Перейти к содержимому',
 },
 auth:{...englishMessages.ra.auth,
  auth_check_error:'Войдите, чтобы продолжить',user_menu:'Профиль',username:'Имя пользователя',password:'Пароль',email:'Email',sign_in:'Войти',sign_in_error:'Не удалось войти. Повторите попытку.',logout:'Выйти',
 },
 notification:{...englishMessages.ra.notification,
  bad_item:'Некорректная запись',item_doesnt_exist:'Запись не найдена',http_error:'Не удалось связаться с сервером',data_provider_error:'Не удалось загрузить данные',i18n_error:'Не удалось загрузить переводы',canceled:'Действие отменено',logged_out:'Сеанс завершён. Войдите снова.',not_authorized:'У вас нет доступа к этим данным.',application_update_available:'Доступна новая версия.',offline:'Нет подключения. Не удалось загрузить данные.',
 },
}};

export function createAdminI18n(lang:Lang){
 // The shared header owns the language; keep react-admin's locale menu hidden.
 return polyglotI18nProvider(locale=>locale==='ru'?russianMessages:englishMessages,lang,[{locale:lang,name:lang==='ru'?'Русский':'English'}]);
}
